export function mockAudioBuffer(text = 'NovelVerse preview', format = 'wav') {
  const body = Buffer.from(`NovelVerse ${format} audio placeholder:${text}`);
  if (format !== 'wav') return body;
  return Buffer.concat([Buffer.from('RIFF....WAVEfmt '), body]);
}
export function contentType(format) { return { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg' }[format] || 'application/octet-stream'; }
