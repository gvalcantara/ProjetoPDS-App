export async function sendSubmission(video: File, calibration: { type: 'field'; data: object } | { type: 'camera'; file: File }, processingFps: number): Promise<string> {
  const form = new FormData()
  form.append('video', video)
  form.append('calibration_type', calibration.type)
  form.append('processing_fps', String(processingFps))
  if (calibration.type === 'field') form.append('field_data', JSON.stringify(calibration.data))
  else form.append('camera', calibration.file)
  const response = await fetch('/api/submissions', { method: 'POST', body: form })
  if (!response.ok) {
    let message = 'Não foi possível enviar os dados. Tente novamente.'
    try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail } catch { /* keep fallback */ }
    throw new Error(message)
  }
  const result: { id: string } = await response.json()
  return result.id
}

export type Position = { instante: number; x: number; y: number }
export type Trajectory = { id_rastreamento: number; posicoes: Position[] }
export type Submission = { id: string; status: 'received' | 'processing' | 'completed' | 'failed'; trajetorias?: Trajectory[]; error?: string; progress?: { frames_processed: number; total_frames: number | null; fps: number | null; estimated_seconds_remaining: number | null } }

export async function getSubmission(id: string, signal: AbortSignal): Promise<Submission> {
  const response = await fetch(`/api/submissions/${encodeURIComponent(id)}`, { signal })
  if (!response.ok) throw new Error('Não foi possível consultar o processamento. Tente novamente.')
  return response.json() as Promise<Submission>
}
