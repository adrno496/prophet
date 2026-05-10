// ============================================================================
// PULSE PREDICT — Chart.js wrapper (CDN dynamique)
// Charge Chart.js v4 au 1er appel, expose des helpers : sparkline, pnlChart,
// accuracyChart. Toutes les charts sont monochrome dark + minimal axes.
// ============================================================================

const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js'
let loadPromise = null

function getCssVar (name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export async function loadChart () {
  if (window.Chart) return window.Chart
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = CHART_CDN
    s.async = true
    s.onload = () => resolve(window.Chart)
    s.onerror = () => { loadPromise = null; reject(new Error('Chart.js load failed')) }
    document.head.appendChild(s)
  })
  return loadPromise
}

// ---------------------------------------------------------------------------
// Sparkline (mini, sans axes)
// data : array de nombres (prix successifs)
// returns { destroy() }
// ---------------------------------------------------------------------------
export async function renderSparkline (canvas, data, opts = {}) {
  if (!canvas || !Array.isArray(data) || data.length < 2) return null
  const Chart = await loadChart()
  const isUp = data[data.length - 1] >= data[0]
  const color = opts.color || (isUp ? getCssVar('--neon', '#00E472') : getCssVar('--red', '#FF3B5C'))

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { borderJoinStyle: 'round' } }
    }
  })
}

// ---------------------------------------------------------------------------
// PnL chart : balance over time
// points : array de { ts: ISO date, balance: number }
// ---------------------------------------------------------------------------
export async function renderPnLChart (canvas, points, opts = {}) {
  if (!canvas || !Array.isArray(points) || points.length < 2) return null
  const Chart = await loadChart()
  const labels = points.map(p => new Date(p.ts).toLocaleDateString())
  const data = points.map(p => Number(p.balance) || 0)
  const startBal = data[0] || 1000
  const endBal = data[data.length - 1] || 1000
  const positive = endBal >= startBal
  const color = positive ? getCssVar('--neon', '#00E472') : getCssVar('--red', '#FF3B5C')
  const muted = getCssVar('--muted', '#666')

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Balance',
        data,
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { display: true, ticks: { color: muted, maxTicksLimit: 4 }, grid: { display: false } },
        y: { display: true, ticks: { color: muted, callback: v => '€' + v }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Accuracy chart : barres correct/incorrect dans le temps (AI track record)
// items : array de { date: 'YYYY-MM-DD', correct: int, incorrect: int }
// ---------------------------------------------------------------------------
export async function renderAccuracyChart (canvas, items) {
  if (!canvas || !Array.isArray(items) || items.length === 0) return null
  const Chart = await loadChart()
  const labels = items.map(i => i.date.slice(5))
  const correct = items.map(i => i.correct || 0)
  const incorrect = items.map(i => i.incorrect || 0)

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Correct',   data: correct,   backgroundColor: getCssVar('--neon', '#00E472') },
        { label: 'Incorrect', data: incorrect, backgroundColor: getCssVar('--red',  '#FF3B5C') }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: getCssVar('--text-muted', '#999'), boxWidth: 12 } },
        tooltip: { mode: 'index' }
      },
      scales: {
        x: { stacked: true, ticks: { color: getCssVar('--muted', '#666') }, grid: { display: false } },
        y: { stacked: true, ticks: { color: getCssVar('--muted', '#666') }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  })
}
