const $ = (id) => document.getElementById(id);
const riskColors = {LOW: '#72d6a2', MODERATE: '#ffb56b', HIGH: '#ff6d78'};

function updateSliderLabels() {
  $('rain-label').textContent = `${$('rainfall').value} mm`;
  $('river-label').textContent = `${Number($('river-level').value).toFixed(1)} / 10`;
  $('soil-label').textContent = `${$('soil-saturation').value}%`;
}
['rainfall','river-level','soil-saturation'].forEach(id => $(id).addEventListener('input', updateSliderLabels));
updateSliderLabels();

$('predict-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('predict-form').querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Calculating…';
  try {
    const response = await fetch('/api/predict', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({rainfall:Number($('rainfall').value), river_level:Number($('river-level').value), soil_saturation:Number($('soil-saturation').value)})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not calculate risk.');
    $('risk-score').textContent = data.risk_score;
    $('model-confidence').textContent = `${data.model_confidence}%`;
    $('risk-badge').textContent = data.level;
    $('risk-badge').className = `risk-badge ${data.level.toLowerCase()}`;
    $('risk-meter').style.width = `${data.risk_score}%`;
    $('risk-meter').style.background = riskColors[data.level];
    $('prediction-note').textContent = `Demo model estimate only. Synthetic-data test accuracy: ${data.demo_model_accuracy}%; this is not real-world forecast accuracy.`;
    $('prediction-box').style.borderColor = `${riskColors[data.level]}55`;
  } catch (error) { $('prediction-note').textContent = error.message; }
  finally { button.disabled = false; button.innerHTML = 'Calculate demo risk <span>→</span>'; }
});

async function loadSummary() {
  try {
    const response = await fetch('/api/summary'); const data = await response.json();
    $('stat-total').textContent = data.total_requests;
    $('stat-new').textContent = data.new_requests;
    $('stat-progress').textContent = data.in_progress;
    $('stat-resolved').textContent = data.resolved;
    $('side-request-count').textContent = data.new_requests;
  } catch (e) { console.error('Summary could not load', e); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function statusClass(status) { return status.toLowerCase().replace(/\s+/g, '-'); }
function formatDate(value) {
  try { return new Date(value).toLocaleString(); } catch { return value; }
}
async function loadRequests() {
  const list = $('request-list');
  try {
    const response = await fetch('/api/requests'); const requests = await response.json();
    if (!requests.length) { list.innerHTML = '<div class="empty-state">No requests yet.<br>Submit a demo request to see it here.</div>'; return; }
    list.innerHTML = requests.slice(0, 12).map(r => `
      <div class="request-item"><div class="request-item-head"><div><strong>#${r.id} · ${escapeHtml(r.emergency_type)}</strong><small>${escapeHtml(r.location)} · ${escapeHtml(formatDate(r.created_at))}</small></div><span class="status-pill ${statusClass(r.status)}">${escapeHtml(r.status)}</span></div>
      <div class="request-detail">${escapeHtml(r.name)} · ${escapeHtml(r.people)} person(s)${r.details ? ' · '+escapeHtml(r.details) : ''}</div>
      <div class="request-controls"><small>${escapeHtml(r.phone)}</small><label><span class="sr-only">Update request status</span><select data-request-id="${r.id}" aria-label="Update status for request ${r.id}"><option ${r.status==='NEW'?'selected':''}>NEW</option><option ${r.status==='IN PROGRESS'?'selected':''}>IN PROGRESS</option><option ${r.status==='RESOLVED'?'selected':''}>RESOLVED</option></select></label></div></div>`).join('');
    list.querySelectorAll('select[data-request-id]').forEach(select => select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        const res = await fetch(`/api/requests/${select.dataset.requestId}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:select.value})});
        const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Update failed');
        await loadSummary(); await loadRequests();
      } catch (e) { alert(e.message); select.disabled = false; }
    }));
  } catch (e) { list.innerHTML = '<div class="empty-state">Could not load requests. Is the Flask server running?</div>'; }
}

$('rescue-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const message = $('form-message');
  const values = Object.fromEntries(new FormData(form).entries()); values.people = Number(values.people);
  button.disabled = true; message.className = 'form-message'; message.textContent = 'Submitting…';
  try {
    const response = await fetch('/api/requests', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not submit request.');
    message.textContent = `${data.message} Request ID: #${data.id}`; form.reset(); form.querySelector('[name="people"]').value = 1;
    await loadSummary(); await loadRequests();
  } catch (error) { message.className = 'form-message error'; message.textContent = error.message; }
  finally { button.disabled = false; }
});
$('refresh-btn').addEventListener('click', async () => { await loadSummary(); await loadRequests(); });
$('requests-refresh').addEventListener('click', async () => { await loadSummary(); await loadRequests(); });

// Illustrative map centered on Tamil Nadu. Markers are examples, not live incident reports.
if (window.L) {
  const map = L.map('map', {scrollWheelZoom:false}).setView([9.3, 78.2], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const markers = [
    {pos:[8.7139,77.7567], name:'Tirunelveli (illustrative)', level:'MODERATE', note:'Example monitoring point'},
    {pos:[9.9252,78.1198], name:'Madurai (illustrative)', level:'LOW', note:'Example monitoring point'},
    {pos:[10.7905,78.7047], name:'Tiruchirappalli (illustrative)', level:'HIGH', note:'Example monitoring point'},
    {pos:[13.0827,80.2707], name:'Chennai (illustrative)', level:'MODERATE', note:'Example monitoring point'},
    {pos:[11.0168,76.9558], name:'Coimbatore (illustrative)', level:'LOW', note:'Example monitoring point'}
  ];
  markers.forEach(m => {
    const color = riskColors[m.level];
    const icon = L.divIcon({className:'risk-map-marker', html:`<div style="width:13px;height:13px;background:${color};border:2px solid #f3f6fa;border-radius:50%;box-shadow:0 0 0 5px ${color}33"></div>`, iconSize:[13,13], iconAnchor:[6,6]});
    L.marker(m.pos,{icon}).addTo(map).bindPopup(`<strong>${escapeHtml(m.name)}</strong><br>${escapeHtml(m.level)} demo category<br><small>${escapeHtml(m.note)} — not live data</small>`);
  });
}
loadSummary(); loadRequests();
