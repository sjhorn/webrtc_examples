const { WebSocketServer, WebSocket } = require('ws');
const { RTCPeerConnection } = require('werift');
const { OpusEncoder } = require('@discordjs/opus');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Whisper server configuration (OpenAI-compatible API)
const WHISPER_SERVER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:8178/v1/audio/transcriptions';

// HTTP server to serve static files
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  } else if (req.url.startsWith('/assets/')) {
    const filePath = path.join(__dirname, req.url);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

httpServer.listen(3000, () => {
  console.log('HTTP server running on http://localhost:3000');
});

// WebSocket signaling server
const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket signaling server running on ws://localhost:8080');

let clientIdCounter = 0;

// Create WAV header for PCM data
function createWavHeader(pcmLength, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmLength, 40);

  return header;
}

// Resample from 48kHz to 16kHz (simple decimation by 3)
function resample48to16(pcm48k) {
  const samples48 = new Int16Array(pcm48k.buffer, pcm48k.byteOffset, pcm48k.length / 2);
  const samples16 = new Int16Array(Math.floor(samples48.length / 3));
  for (let i = 0; i < samples16.length; i++) {
    samples16[i] = samples48[i * 3];
  }
  return Buffer.from(samples16.buffer);
}

// Send audio to whisper-server and get transcription
async function transcribeAudio(wavData, timeoutMs = 30000) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const formData = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    wavData,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`)
  ]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(WHISPER_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Whisper error: ${response.status}`);
    const result = await response.json();
    return result.text?.trim() || '';
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Whisper STT - sends audio to whisper-server
class WhisperSTT {
  constructor(clientId) {
    this.clientId = clientId;
    this.audioChunks = [];      // Current buffer for streaming
    this.allAudioChunks = [];   // Keep all audio for final transcription
    this.totalBytes = 0;
    this.accumulatedTranscript = '';  // Accumulated text from all chunks
    this.pendingTranscription = null;
  }

  // Add PCM audio chunk (48kHz mono 16-bit)
  addAudio(pcmBuffer) {
    // Resample to 16kHz for Whisper
    const resampled = resample48to16(pcmBuffer);
    this.audioChunks.push(resampled);
    this.allAudioChunks.push(resampled);  // Keep copy for final
    this.totalBytes += resampled.length;
  }

  // Stream transcription every ~1.5 seconds of audio
  shouldTranscribe() {
    // 16kHz * 2 bytes * 1.5 seconds = 48000 bytes
    return this.totalBytes >= 48000 && !this.pendingTranscription;
  }

  // Send chunk to whisper-server
  async transcribe() {
    if (this.audioChunks.length === 0) return null;

    const pcmData = Buffer.concat(this.audioChunks);
    const wavData = Buffer.concat([createWavHeader(pcmData.length), pcmData]);

    this.audioChunks = [];
    this.totalBytes = 0;
    this.pendingTranscription = true;

    try {
      const text = await transcribeAudio(wavData);
      this.pendingTranscription = false;

      if (text && !text.includes('[BLANK_AUDIO]')) {
        this.accumulatedTranscript = this.accumulatedTranscript
          ? this.accumulatedTranscript + ' ' + text
          : text;
        return { text: this.accumulatedTranscript, isNew: true };
      }
      return { text: this.accumulatedTranscript || '...', isNew: false };
    } catch (err) {
      this.pendingTranscription = false;
      console.error(`Client ${this.clientId} error:`, err.message);
      return { text: this.accumulatedTranscript || '[Error]', isNew: false };
    }
  }

  // Final transcription with ALL audio
  async finalize() {
    if (this.allAudioChunks.length === 0) return { text: '[No speech]' };

    const pcmData = Buffer.concat(this.allAudioChunks);
    const wavData = Buffer.concat([createWavHeader(pcmData.length), pcmData]);

    try {
      const text = await transcribeAudio(wavData, 60000);
      return { text: text || '[No speech]' };
    } catch (err) {
      console.error(`Client ${this.clientId} finalize error:`, err.message);
      return { text: this.accumulatedTranscript || '[Error]' };
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = clientIdCounter++;
  console.log(`Client ${clientId} connected`);

  let pc = null;
  let dc = null;  // Data channel for transcriptions
  let decoder = null;
  let stt = null;

  ws.on('message', async (msg) => {
    try {
      const { type, payload } = JSON.parse(msg.toString());
      console.log(`Client ${clientId} sent: ${type}`);

      switch (type) {
        case 'offer':
          // Create new peer connection for this client
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });

          // Initialize Opus decoder (48kHz mono)
          decoder = new OpusEncoder(48000, 1);
          stt = new WhisperSTT(clientId);

          // Receive data channel from browser for sending transcriptions
          pc.ondatachannel = (event) => {
            dc = event.channel;
            dc.onopen = () => console.log(`Client ${clientId}: Data channel open`);
          };

          // Handle ICE candidates
          pc.onicecandidate = ({ candidate }) => {
            if (candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'candidate', payload: candidate }));
            }
          };

          // Handle incoming audio track
          pc.ontrack = (event) => {
            const track = event.track;
            console.log(`Client ${clientId}: Received track kind=${track.kind}`);

            if (track.kind === 'audio') {
              // Subscribe to RTP packets
              track.onReceiveRtp.subscribe(async (rtpPacket) => {
                try {
                  // Decode Opus to PCM and add to STT buffer
                  const pcm = decoder.decode(rtpPacket.payload);
                  stt.addAudio(pcm);

                  // Send to Whisper when we have enough audio
                  if (stt.shouldTranscribe()) {
                    const result = await stt.transcribe();
                    if (result && result.isNew && dc && dc.readyState === 'open') {
                      dc.send(JSON.stringify({
                        type: 'transcription',
                        text: result.text
                      }));
                    }
                  }
                } catch (err) {
                  // Silently ignore decode errors (can happen with padding packets)
                }
              });
            }
          };

          // Set remote description (offer from client)
          await pc.setRemoteDescription(payload);

          // Create and set local description (answer)
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Send answer back to client
          ws.send(JSON.stringify({ type: 'answer', payload: answer }));
          console.log(`Client ${clientId}: Sent answer`);
          break;

        case 'candidate':
          // Add ICE candidate from client
          if (pc && payload) {
            await pc.addIceCandidate(payload);
            console.log(`Client ${clientId}: Added ICE candidate`);
          }
          break;

        case 'done':
          // Client finished sending audio
          if (stt) {
            const finalResult = await stt.finalize();
            if (dc && dc.readyState === 'open') {
              dc.send(JSON.stringify({
                type: 'transcription',
                text: finalResult.text,
                final: true
              }));
            }
            console.log(`Client ${clientId}: ${finalResult.text}`);
          }
          break;

        default:
          console.log(`Client ${clientId}: Unknown message type: ${type}`);
      }
    } catch (err) {
      console.error(`Client ${clientId} error:`, err.message);
    }
  });

  ws.on('close', () => {
    console.log(`Client ${clientId} disconnected`);
    if (pc) pc.close();
  });

  ws.on('error', (err) => {
    console.error(`Client ${clientId} WebSocket error:`, err.message);
  });
});

console.log('Server ready. Open http://localhost:3000 in a browser.');
