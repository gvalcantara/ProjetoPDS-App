type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

// MediaRecorder captures in real time; it does not require uploading the full video.
export async function trimVideo(video: HTMLVideoElement, start: number, end: number): Promise<File> {
  const source = video as CapturableVideo
  const capture = source.captureStream ?? source.mozCaptureStream
  if (!capture || typeof MediaRecorder === 'undefined') throw new Error('Este navegador não permite recortar vídeo. Use um navegador compatível com MediaRecorder e captura de vídeo.')
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mime) throw new Error('Este navegador não suporta a gravação do trecho em WebM.')
  video.pause()
  if (Math.abs(video.currentTime - start) > 0.001) {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('Não foi possível posicionar o vídeo.')), { once: true })
      video.currentTime = start
    })
  }
  const stream = capture.call(source)
  const recorder = new MediaRecorder(stream, { mimeType: mime })
  const chunks: Blob[] = []
  let animation = 0
  try {
    return await new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => reject(new Error('Não foi possível gravar o trecho selecionado.'))
      recorder.onstop = () => chunks.length ? resolve(new File(chunks, 'trecho.webm', { type: mime })) : reject(new Error('O trecho gravado está vazio.'))
      const check = () => {
        if (video.currentTime >= end || video.ended) { video.pause(); if (recorder.state !== 'inactive') recorder.stop(); return }
        animation = requestAnimationFrame(check)
      }
      recorder.start()
      video.play().then(() => { animation = requestAnimationFrame(check) }).catch(() => { if (recorder.state !== 'inactive') recorder.stop(); reject(new Error('Não foi possível reproduzir o vídeo para recortá-lo.')) })
    })
  } finally {
    cancelAnimationFrame(animation)
    video.pause()
    stream.getTracks().forEach(track => track.stop())
  }
}
