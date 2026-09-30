export const getWeekNumber = (dateInput = new Date()) => {
  const date = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

export const isWeekend = (dateInput = new Date()) => {
  const day = dateInput.getDay()
  return day === 0 || day === 6
}

export const formatDateTR = (isoString) => {
  if (!isoString) return '-'
  const dt = new Date(isoString)
  return dt.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
