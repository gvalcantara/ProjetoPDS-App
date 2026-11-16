export async function sendSubmission(video: File, calibration: { type: 'field'; data: object } | { type: 'camera'; file: File }): Promise<string> {
  const form = new FormData()
  form.append('video', video)
  form.append('calibration_type', calibration.type)
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
