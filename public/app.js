// ============ 工具 ============
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg, warn = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('warn', warn);
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2500);
}
function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ============ 状态 ============
const state = {
  meta: null, inspections: [], purchases: [], fabrics: [], suppliers: [],
  view: 'dashboard', currentUser: { name: 'admin', dept: '采购部' }
};

// ============ API 封装 ============
const api = {
  async req(method, url, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(url, opt);
    if (!r.ok) throw new Error('请求失败 ' + r.status);
    return r.json();
  },
  get: u => api.req('GET', u),
  post: (u, b) => api.req('POST', u, b),
  put: (u, b) => api.req('PUT', u, b),
  del: u => api.req('DELETE', u),
};

// ============ 数据加载 ============
async function loadAll() {
  try {
    const [meta, ins, pur, fab, sup] = await Promise.all([
      api.get('/api/meta'), api.get('/api/inspections'), api.get('/api/purchases'),
      api.get('/api/fabrics'), api.get('/api/suppliers')
    ]);
    Object.assign(state, { meta, inspections: ins, purchases: pur, fabrics: fab, suppliers: sup });
  } catch (e) {
    toast('后端连接失败，请检查服务是否启动', true);
  }
}

// ============ 判定逻辑 ============
function limitFor(key, cat) {
  const L = state.meta.limits[key];
  if (!L) return null;
  return L[cat] || L.B;
}
function standardText(key, cat) {
  const L = state.meta.limits[key];
  if (!L) return '';
  const lm = L[cat] || L.B;
  const unit = L.unit;
  if (L.type === 'max') return `≤ ${lm.max}${unit}`;
  if (L.type === 'min') return `≥ ${lm.min}${unit}`;
  if (L.type === 'range') return `${lm.min}-${lm.max}${unit}`;
  if (L.type === 'none') return '无';
  return '';
}
function judgeItem(key, value, cat) {
  const L = state.meta.limits[key];
  if (!L) return true;
  const lm = L[cat] || L.B;
  if (value === '' || value === null || value === undefined) return null; // 未填写
  if (L.type === 'none') return String(value) === '无' || String(value) === '';
  if (L.type === 'max') return Number(value) <= lm.max;
  if (L.type === 'min') return Number(value) >= lm.min;
  if (L.type === 'range') { const v = Number(value); return v >= lm.min && v <= lm.max; }
  return true;
}
function computeResult(projects, cat) {
  const filled = projects.map(p => ({ ...p, pass: judgeItem(p.key, p.value, cat) }));
  const hasValue = filled.filter(p => p.pass !== null);
  // 全部有值则判定；有未填则不完整
  const allFilled = filled.every(p => p.pass !== null);
  if (!allFilled) return { result: null, items: filled }; // 草稿/不完整
  const pass = filled.every(p => p.pass);
  return { result: pass ? 'pass' : 'fail', items: filled };
}

// ============ 导航 ============
function switchView(view) {
  state.view = view;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  location.hash = view;
  render();
}

// ============ 弹窗 ============
function openModal(html, lg = false) {
  const mask = $('#modal-mask');
  const m = $('#modal');
  m.className = 'modal' + (lg ? ' lg' : '');
  m.innerHTML = html;
  mask.style.display = 'flex';
  // 点击遮罩关闭
  mask.onclick = e => { if (e.target === mask) closeModal(); };
}
function closeModal() { $('#modal-mask').style.display = 'none'; }

// ============ 主渲染 ============
function render() {
  const v = $('#view');
  if (state.view === 'dashboard') v.innerHTML = viewDashboard();
  else if (state.view === 'inspections') v.innerHTML = viewInspections();
  else if (state.view === 'purchases') v.innerHTML = viewPurchases();
  else if (state.view === 'fabrics') v.innerHTML = viewFabrics();
  else if (state.view === 'suppliers') v.innerHTML = viewSuppliers();
  bindViewEvents();
}

// ============ 工作台 ============
function viewDashboard() {
  const ins = state.inspections;
  const judged = ins.filter(i => i.overallResult);
  const pass = ins.filter(i => i.overallResult === 'pass');
  const fail = ins.filter(i => i.overallResult === 'fail');
  const rate = judged.length ? Math.round(pass.length / judged.length * 100) : 0;
  // 动态
  const dyn = [
    ...ins.map(i => ({ t: i.createdAt, text: `面料「${i.fabricName}」检测${i.overallResult === 'pass' ? '合格' : i.overallResult === 'fail' ? '不合格' : '草稿待补录'}`, cls: i.overallResult === 'pass' ? 'pass' : i.overallResult === 'fail' ? 'fail' : 'draft', id: i.id, type: 'ins' })),
    ...state.purchases.map(p => ({ t: p.createdAt, text: `采购单 ${p.id} 「${p.fabricName}」${p.status}`, cls: 'blue', id: p.id, type: 'po' }))
  ].sort((a,b) => new Date(b.t) - new Date(a.t)).slice(0, 8);
  return `
    <div class="page-head">
      <div><h1>工作台</h1><div class="sub">你好，admin · ${fmtDate(new Date())} · 累计检测 ${ins.length} 款面料</div></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" onclick="openInspectionForm()">＋ 新建检测</button>
        <button class="btn btn-outline" onclick="openPurchaseForm()">＋ 新建采购</button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card blue"><div class="kpi-label">总检测数</div><div class="kpi-value">${ins.length}</div></div>
      <div class="kpi-card green"><div class="kpi-label">检测合格</div><div class="kpi-value">${pass.length}</div></div>
      <div class="kpi-card red"><div class="kpi-label">检测不合格</div><div class="kpi-value">${fail.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">合格率</div><div class="kpi-value">${rate}%</div></div>
    </div>
    <div class="card">
      <div class="card-title">近期动态</div>
      ${dyn.length ? dyn.map(d => `
        <div class="dyn-item" style="cursor:pointer" onclick="gotoItem('${d.type}','${d.id}')">
          <div class="dyn-dot" style="background:${d.cls==='pass'?'var(--green)':d.cls==='fail'?'var(--red)':'var(--amber)'}"></div>
          <div style="flex:1">
            <div class="dyn-title">${esc(d.text)}</div>
            <div class="dyn-time">${fmtDateTime(d.t)}</div>
          </div>
        </div>`).join('') : '<div class="empty">暂无动态</div>'}
    </div>`;
}

// ============ 面料检测 ============
let insFilter = 'all';
function viewInspections() {
  const ins = state.inspections;
  const counts = {
    all: ins.length,
    pass: ins.filter(i => i.overallResult === 'pass').length,
    fail: ins.filter(i => i.overallResult === 'fail').length,
    draft: ins.filter(i => !i.overallResult).length
  };
  const list = insFilter === 'all' ? ins : ins.filter(i => (insFilter === 'pass' && i.overallResult === 'pass') || (insFilter === 'fail' && i.overallResult === 'fail') || (insFilter === 'draft' && !i.overallResult));
  return `
    <div class="page-head">
      <div><h1>面料检测</h1><div class="sub">共 ${ins.length} 个检测单</div></div>
      <button class="btn btn-primary" onclick="openInspectionForm()">＋ 新建检测</button>
    </div>
    <div class="tabs">
      ${['all','pass','fail','draft'].map(t => `<button class="tab ${insFilter===t?'active':''}" onclick="insFilter='${t}';render()">${t==='all'?'全部':t==='pass'?'合格':t==='fail'?'不合格':'草稿'}${t==='all'?'':`<span class="cnt">${counts[t]}</span>`}</button>`).join('')}
    </div>
    <div class="card">
      <table>
        <thead><tr><th>检测单号</th><th>面料</th><th>成分</th><th>检测标准</th><th>送检人</th><th>送检时间</th><th>判定</th><th>操作</th></tr></thead>
        <tbody>
          ${list.length ? list.map(i => `
            <tr>
              <td><b>${esc(i.id)}</b></td>
              <td>${esc(i.fabricName)}</td>
              <td>${esc(i.composition)}</td>
              <td>${esc(stdName(i.standard))}</td>
              <td>${esc(i.submitter)}</td>
              <td>${fmtDate(i.createdAt)}</td>
              <td>${i.overallResult ? badge(i.overallResult) : '<span class="badge badge-draft">草稿</span>'}</td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="openInspectionDetail('${i.id}')">查看</button>
                ${i.overallResult ? '' : `<button class="btn btn-primary btn-sm" onclick="continueInspection('${i.id}')">继续补录</button>`}
                <button class="btn btn-danger btn-sm" onclick="deleteInspection('${i.id}')">删除</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="8" class="empty">暂无检测单</td></tr>'}
        </tbody>
      </table>
    </div>`;
}
const badge = r => r === 'pass' ? '<span class="badge badge-pass">合格</span>' : '<span class="badge badge-fail">不合格</span>';
const stdName = id => (state.meta.standards.find(s => s.id === id) || {}).name || id;

// 新建检测表单
function openInspectionForm() { openInspectionFormInner(); }
function openInspectionFormInner(draft = null) {
  const meta = state.meta;
  const fabs = state.fabrics;
  const sups = state.suppliers;
  const d = draft || {};
  let cat = d.category || 'B';
  let std = d.standard || 'gb18401';
  let selKeys = (d.projects || []).map(p => p.key);
  let values = {};
  (d.projects || []).forEach(p => values[p.key] = p.value);
  openModal(`
    <span class="close" onclick="closeModal()">✕</span>
    <h2>${draft ? '编辑检测单' : '新建检测任务'}</h2>
    <div class="form-grid">
      <div class="field"><label>面料样品</label><select id="f_fabric">
        ${fabs.map(f => `<option value="${f.id}" ${d.fabricId===f.id?'selected':''}>${esc(f.name)}（${esc(f.composition)}）</option>`).join('')}
      </select></div>
      <div class="field"><label>供应商</label><select id="f_supplier">
        ${sups.map(s => `<option value="${s.id}" ${(d.supplier||'SUP001')===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>检测标准</label><select id="f_std" onchange="onStdChange()">
        ${meta.standards.map(s => `<option value="${s.id}" ${std===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>安全类别</label><select id="f_cat" onchange="onCatChange()">
        ${['A','B','C'].map(c => `<option value="${c}" ${cat===c?'selected':''}>${c==='A'?'A类（婴幼儿）':c==='B'?'B类（直接接触皮肤）':'C类（非直接接触皮肤）'}</option>`).join('')}
      </select></div>
      <div class="field"><label>送检人</label><input id="f_sub" value="${esc(d.submitter||'admin')}"></div>
      <div class="field full"><label>备注</label><input id="f_note" value="${esc(d.note||'')}"></div>
    </div>
    <h3 class="mt16">检测项目（勾选后展开录入实测值，实时判定）</h3>
    <div id="projArea"></div>
    <div id="summaryCard" class="card" style="background:#f8fafc;display:none"></div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-outline" onclick="saveDraft()">保存草稿</button>
      <button class="btn btn-primary" onclick="submitInspection()">提交检测</button>
    </div>
  `, true);
  // 渲染项目勾选区
  renderProjCheckboxes(selKeys, values, cat);
  window.__draftId = draft ? draft.id : null;
}

function renderProjCheckboxes(selKeys = [], values = {}, cat = 'B') {
  const area = $('#projArea');
  const meta = state.meta;
  area.innerHTML = `<div class="form-grid" style="margin-bottom:12px">
    ${meta.projects.map(p => `<label class="field" style="flex-direction:row;align-items:center;gap:6px;cursor:pointer">
      <input type="checkbox" value="${p.key}" ${selKeys.includes(p.key)?'checked':''} onchange="onProjToggle()">
      <span>${esc(p.name)}</span>
    </label>`).join('')}
  </div>
  <div id="projDetailArea"></div>`;
  window.__sel = [...selKeys];
  window.__values = { ...values };
  window.__cat = cat;
  renderProjDetails(cat);
}

function onProjToggle() {
  const boxes = $$('#projArea input[type=checkbox]');
  const sel = boxes.filter(b => b.checked).map(b => b.value);
  window.__sel = sel;
  renderProjDetails(window.__cat);
}
function onStdChange() { window.__cat = $('#f_cat').value; renderProjDetails(window.__cat); }
function onCatChange() { window.__cat = $('#f_cat').value; renderProjDetails(window.__cat); }

function renderProjDetails(cat) {
  const area = $('#projDetailArea');
  const meta = state.meta;
  const sel = window.__sel || [];
  const values = window.__values || {};
  if (!sel.length) { area.innerHTML = ''; $('#summaryCard').style.display='none'; return; }
  area.innerHTML = sel.map(k => {
    const p = meta.projects.find(x => x.key === k);
    const stdTxt = standardText(k, cat);
    const val = values[k] ?? '';
    const pass = judgeItem(k, val, cat);
    const resTxt = pass === null ? '<span style="color:#9ca3af">待填写</span>' : (pass ? '<span class="p-result pass">合格</span>' : '<span class="p-result fail">不合格</span>');
    return `<div class="proj-row" data-key="${k}">
      <div class="p-name">${esc(p.name)}</div>
      <div class="p-standard">标准：${esc(stdTxt)}</div>
      <div><input type="number" step="any" value="${esc(val)}" placeholder="实测值" oninput="onValInput('${k}',this.value)"></div>
      <div>${resTxt}</div>
    </div>`;
  }).join('');
  updateSummary(cat);
}

function onValInput(key, v) {
  window.__values[key] = v;
  renderProjDetails(window.__cat);
}

function updateSummary(cat) {
  const meta = state.meta;
  const sel = window.__sel || [];
  const values = window.__values || {};
  const projects = sel.map(k => ({ key: k, value: values[k] ?? '' }));
  const { result, items } = computeResult(projects, cat);
  const card = $('#summaryCard');
  card.style.display = 'block';
  const filled = items.filter(i => i.pass !== null).length;
  const grade = result === 'pass' ? '优等' : result === 'fail' ? '不合格' : '-';
  card.innerHTML = `
    <div class="card-title">检测结果汇总</div>
    <div style="display:flex;gap:30px;flex-wrap:wrap">
      <div><span class="muted">已填/总项：</span><b>${filled}/${items.length}</b></div>
      <div><span class="muted">总体判定：</span>${result ? badge(result) : '<span class="badge badge-draft">待填写完成</span>'}</div>
      <div><span class="muted">质量等级：</span><b>${grade}</b></div>
    </div>`;
}

function collectForm() {
  const f = $('#f_fabric').value;
  const fab = state.fabrics.find(x => x.id === f);
  const supplier = $('#f_supplier').value;
  const standard = $('#f_std').value;
  const category = $('#f_cat').value;
  const submitter = $('#f_sub').value || 'admin';
  const note = $('#f_note').value || '';
  const sel = window.__sel || [];
  const values = window.__values || {};
  const projects = sel.map(k => ({ key: k, value: values[k] ?? '' }));
  return { fabricId: fab.id, fabricName: fab.name, composition: fab.composition, weight: fab.weight, supplier, standard, category, submitter, note, projects };
}

function saveDraft() {
  const data = collectForm();
  if (!data.fabricName || !data.projects.length) { toast('请至少填写面料并选择一个检测项目', true); return; }
  const { result } = computeResult(data.projects, data.category);
  const body = { ...data, overallResult: result, quality: result === 'pass' ? '一等' : '不合格', isDraft: 1, id: window.__draftId || undefined, createdAt: new Date().toISOString() };
  (window.__draftId ? api.put(`/api/inspections/${window.__draftId}`, body) : api.post('/api/inspections', body))
    .then(async () => { toast('草稿已保存，可继续补录'); closeModal(); await loadAll(); render(); })
    .catch(e => toast(e.message, true));
}

function submitInspection() {
  const data = collectForm();
  if (!data.projects.length) { toast('请至少选择一个检测项目', true); return; }
  const { result, items } = computeResult(data.projects, data.category);
  if (result === null) { toast('请填写所有选中项目的实测值', true); return; }
  const quality = result === 'pass' ? '一等' : '不合格';
  const body = { ...data, projects: items, overallResult: result, quality, isDraft: 0, id: window.__draftId || undefined, createdAt: new Date().toISOString() };
  (window.__draftId ? api.put(`/api/inspections/${window.__draftId}`, body) : api.post('/api/inspections', body))
    .then(async () => { toast(`检测${result==='pass'?'合格':'不合格'}，已提交`); closeModal(); await loadAll(); render(); })
    .catch(e => toast(e.message, true));
}

function continueInspection(id) {
  const i = state.inspections.find(x => x.id === id);
  if (i) openInspectionFormInner(i);
}

// 检测详情
function openInspectionDetail(id) {
  const i = state.inspections.find(x => x.id === id);
  if (!i) return;
  const related = state.purchases.filter(p => p.inspectionId === id);
  openModal(`
    <span class="close" onclick="closeModal()">✕</span>
    <h2>检测报告 · ${esc(i.id)}</h2>
    <div class="form-grid" style="margin-bottom:16px">
      <div class="field"><label>面料</label><div><b>${esc(i.fabricName)}</b>（${esc(i.composition)}）</div></div>
      <div class="field"><label>克重</label><div>${esc(i.weight)}</div></div>
      <div class="field"><label>检测标准</label><div>${esc(stdName(i.standard))}</div></div>
      <div class="field"><label>安全类别</label><div>${i.category}类</div></div>
      <div class="field"><label>送检人</label><div>${esc(i.submitter)}</div></div>
      <div class="field"><label>送检时间</label><div>${fmtDateTime(i.createdAt)}</div></div>
      <div class="field"><label>总体判定</label><div>${i.overallResult ? badge(i.overallResult) : '<span class="badge badge-draft">草稿</span>'}</div></div>
      <div class="field"><label>质量等级</label><div><b>${esc(i.quality)}</b></div></div>
    </div>
    <h3>检测项目结果</h3>
    <table>
      <thead><tr><th>检测项目</th><th>标准值</th><th>实测值</th><th>判定</th></tr></thead>
      <tbody>
        ${(i.projects||[]).map(p => {
          const pass = judgeItem(p.key, p.value, i.category);
          const pj = state.meta.projects.find(x => x.key === p.key);
          return `<tr>
            <td>${esc(pj ? pj.name : p.key)}</td>
            <td>${esc(standardText(p.key, i.category))}</td>
            <td>${esc(p.value)}</td>
            <td>${pass===null?'<span class="badge badge-draft">未填</span>':pass?'<span class="badge badge-pass">合格</span>':'<span class="badge badge-fail">不合格</span>'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" class="empty">无项目</td></tr>'}
      </tbody>
    </table>
    <div class="mt16 muted">备注：${esc(i.note || '无')}</div>
    <div class="mt16" style="display:flex;gap:10px">
      ${!i.overallResult ? `<button class="btn btn-primary" onclick="closeModal();continueInspection('${i.id}')">继续补录</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal();editInspection('${i.id}')">编辑报告</button>
      ${related.length ? `<div class="muted" style="display:flex;align-items:center">已关联 ${related.length} 个采购单</div>` : ''}
    </div>
  `, true);
}

function editInspection(id) {
  const i = state.inspections.find(x => x.id === id);
  if (i) openInspectionFormInner(i);
}

function deleteInspection(id) {
  const i = state.inspections.find(x => x.id === id);
  const related = state.purchases.filter(p => p.inspectionId === id);
  const warn = related.length ? `该检测单已被 ${related.map(r=>r.id).join('、')} 采购单引用，删除后引用将失效。` : '';
  openModal(`
    <h2>确认删除</h2>
    <p>确定删除检测单 <b>${esc(i.id)}</b>（${esc(i.fabricName)}）吗？</p>
    ${warn ? `<div style="margin-top:12px;background:#fef3c7;color:#92400e;padding:10px;border-radius:8px">⚠ ${esc(warn)}</div>` : ''}
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="confirmDelIns('${id}')">确认删除</button>
    </div>
  `);
}
async function confirmDelIns(id) {
  try { await api.del(`/api/inspections/${id}`); toast('检测单已删除'); closeModal(); await loadAll(); render(); }
  catch(e){ toast(e.message,true); }
}

// ============ 采购管理 ============
let poFilter = 'all';
const PO_STATUS = ['待审批','待付款','已下单','已到货','已完成'];
function viewPurchases() {
  const pos = state.purchases;
  const list = poFilter === 'all' ? pos : pos.filter(p => p.status === poFilter);
  return `
    <div class="page-head">
      <div><h1>采购管理</h1><div class="sub">共 ${pos.length} 个采购单</div></div>
      <button class="btn btn-primary" onclick="openPurchaseForm()">＋ 新建采购</button>
    </div>
    <div class="tabs">
      <button class="tab ${poFilter==='all'?'active':''}" onclick="poFilter='all';render()">全部</button>
      ${PO_STATUS.map(s => `<button class="tab ${poFilter===s?'active':''}" onclick="poFilter='${s}';render()">${s}<span class="cnt">${pos.filter(p=>p.status===s).length}</span></button>`).join('')}
    </div>
    <div class="card">
      <table>
        <thead><tr><th>采购单号</th><th>面料</th><th>数量</th><th>单价(元)</th><th>金额(元)</th><th>供应商</th><th>交期</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${list.length ? list.map(p => `
            <tr>
              <td><b>${esc(p.id)}</b></td>
              <td>${esc(p.fabricName)}</td>
              <td>${p.qty} ${esc(p.unit)}</td>
              <td>${p.price}</td>
              <td><b>${Number(p.amount).toLocaleString()}</b></td>
              <td>${esc(supName(p.supplier))}</td>
              <td>${esc(p.dueDate)}</td>
              <td><span class="badge ${p.status==='待审批'?'badge-gray':p.status==='待付款'?'badge-blue':p.status==='已下单'?'badge-pass':''}">${esc(p.status)}</span></td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="openPoDetail('${p.id}')">查看</button>
                <button class="btn btn-danger btn-sm" onclick="deletePo('${p.id}')">删除</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="9" class="empty">暂无采购单</td></tr>'}
        </tbody>
      </table>
    </div>`;
}
const supName = id => (state.suppliers.find(s => s.id === id) || {}).name || id;

function openPurchaseForm() {
  const passed = state.inspections.filter(i => i.overallResult === 'pass');
  if (!passed.length) { toast('暂无检测合格的面料，请先完成检测', true); return; }
  openModal(`
    <span class="close" onclick="closeModal()">✕</span>
    <h2>新建采购单</h2>
    <div class="form-grid">
      <div class="field full"><label>选择检测合格的面料</label><select id="p_ins" onchange="onPoFabChange()">
        ${passed.map(i => `<option value="${i.id}" data-fab="${i.fabricId}" data-name="${esc(i.fabricName)}">${esc(i.id)} · ${esc(i.fabricName)}（${esc(stdName(i.standard))}）</option>`).join('')}
      </select></div>
      <div class="field"><label>面料</label><div id="p_fab_name" class="muted">-</div></div>
      <div class="field"><label>供应商</label><select id="p_supplier">
        ${state.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>数量</label><input type="number" id="p_qty" value="1000" min="1"></div>
      <div class="field"><label>单位</label><select id="p_unit"><option>米</option><option>匹</option><option>码</option></select></div>
      <div class="field"><label>单价(元)</label><input type="number" id="p_price" value="15" step="0.1" min="0"></div>
      <div class="field"><label>期望交期</label><input type="date" id="p_due"></div>
      <div class="field full"><label>采购理由</label><textarea id="p_reason" rows="2" placeholder="请输入采购理由"></textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitPurchase()">提交采购单</button>
    </div>
  `);
  onPoFabChange();
}
function onPoFabChange() {
  const sel = $('#p_ins');
  const opt = sel.options[sel.selectedIndex];
  $('#p_fab_name').textContent = opt ? (opt.dataset.name + ' (' + opt.dataset.fab + ')') : '-';
}
function submitPurchase() {
  const insId = $('#p_ins').value;
  const ins = state.inspections.find(i => i.id === insId);
  const qty = +$('#p_qty').value, price = +$('#p_price').value;
  if (!qty || qty < 1) { toast('请输入有效数量', true); return; }
  const body = {
    inspectionId: insId, fabricId: ins.fabricId, fabricName: ins.fabricName,
    qty, unit: $('#p_unit').value, price, amount: Math.round(qty*price),
    supplier: $('#p_supplier').value, dueDate: $('#p_due').value, reason: $('#p_reason').value,
    status: '待审批', applicant: 'admin', createdAt: new Date().toISOString()
  };
  api.post('/api/purchases', body).then(async () => { toast('采购单已提交，待审批'); closeModal(); await loadAll(); render(); }).catch(e=>toast(e.message,true));
}

function openPoDetail(id) {
  const p = state.purchases.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <span class="close" onclick="closeModal()">✕</span>
    <h2>采购单详情 · ${esc(p.id)}</h2>
    <div class="form-grid">
      <div class="field"><label>面料</label><div><b>${esc(p.fabricName)}</b></div></div>
      <div class="field"><label>关联检测单</label><div>${esc(p.inspectionId)}</div></div>
      <div class="field"><label>数量</label><div>${p.qty} ${esc(p.unit)}</div></div>
      <div class="field"><label>单价/金额</label><div>¥${p.price} / <b>¥${Number(p.amount).toLocaleString()}</b></div></div>
      <div class="field"><label>供应商</label><div>${esc(supName(p.supplier))}</div></div>
      <div class="field"><label>期望交期</label><div>${esc(p.dueDate)}</div></div>
      <div class="field"><label>申请人</label><div>${esc(p.applicant)}</div></div>
      <div class="field"><label>状态</label><div><span class="badge badge-blue">${esc(p.status)}</span></div></div>
      <div class="field full"><label>采购理由</label><div>${esc(p.reason||'无')}</div></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">关闭</button>
      <button class="btn btn-primary" onclick="advancePo('${p.id}')">推进状态</button>
    </div>
  `);
}
async function advancePo(id) {
  const p = state.purchases.find(x => x.id === id);
  const idx = PO_STATUS.indexOf(p.status);
  if (idx >= PO_STATUS.length - 1) { toast('已是最终状态'); return; }
  const next = PO_STATUS[idx+1];
  try { await api.put(`/api/purchases/${id}`, { ...p, status: next }); toast(`采购单已推进到「${next}」`); closeModal(); await loadAll(); render(); } catch(e){toast(e.message,true);}
}
async function deletePo(id) {
  openModal(`<h2>确认删除</h2><p>删除采购单 ${esc(id)}？</p>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDelPo('${id}')">确认删除</button></div>`);
}
async function doDelPo(id) { try{ await api.del(`/api/purchases/${id}`); toast('采购单已删除'); closeModal(); await loadAll(); render(); }catch(e){toast(e.message,true);} }

// ============ 面料库 ============
let fabSearch = '';
function viewFabrics() {
  const list = state.fabrics.filter(f => !fabSearch || (f.name.includes(fabSearch) || (f.composition||'').includes(fabSearch) || (f.use||'').includes(fabSearch)));
  return `
    <div class="page-head">
      <div><h1>面料库</h1><div class="sub">市面常见面料检测数值参考 · 共 ${state.fabrics.length} 种</div></div>
      <button class="btn btn-primary" onclick="openFabricForm()">＋ 新增面料</button>
    </div>
    <div class="search-bar"><input placeholder="搜索面料/成分/用途…" value="${esc(fabSearch)}" oninput="fabSearch=this.value;render()"></div>
    <div class="fabric-grid">
      ${list.length ? list.map(f => `
        <div class="fabric-card">
          <button class="del" title="删除" onclick="deleteFabric('${f.id}')">✕</button>
          <div class="fabric-name">${esc(f.name)}</div>
          <div class="fabric-comp">${esc(f.composition)} · ${esc(f.weight)}</div>
          <div class="ref-grid">
            ${f.ref ? Object.entries(f.ref).map(([k,v]) => `<div class="k">${refName(k)}</div><div class="v">${esc(v)}</div>`).join('') : ''}
          </div>
          <div class="muted mt16" style="font-size:12px">用途：${esc(f.use||'')}</div>
        </div>`).join('') : '<div class="empty">无匹配面料</div>'}
    </div>`;
}
const refName = k => ({formaldehyde:'甲醛',ph:'pH',waterColor:'耐水洗色牢度',rubColor:'耐摩擦色牢度',strength:'断裂强力',pilling:'起毛起球',shrinkage:'缩水率'}[k]||k);

function openFabricForm() {
  openModal(`
    <span class="close" onclick="closeModal()">✕</span>
    <h2>新增面料</h2>
    <div class="form-grid">
      <div class="field"><label>面料名称 *</label><input id="fb_name" placeholder="如：全棉平纹布"></div>
      <div class="field"><label>成分 *</label><input id="fb_comp" placeholder="如：100%棉"></div>
      <div class="field"><label>克重区间 *</label><input id="fb_weight" placeholder="如：120-160 g/m²"></div>
      <div class="field"><label>用途</label><input id="fb_use" placeholder="如：T恤、衬衫"></div>
      <div class="field"><label>甲醛参考</label><input id="fb_fa" placeholder="如：≤20 mg/kg"></div>
      <div class="field"><label>pH参考</label><input id="fb_ph" placeholder="如：6.0-7.5"></div>
      <div class="field"><label>耐水洗色牢度参考</label><input id="fb_wc" placeholder="如：3-4级"></div>
      <div class="field"><label>耐摩擦色牢度参考</label><input id="fb_rc" placeholder="如：3-4级"></div>
      <div class="field"><label>断裂强力参考</label><input id="fb_st" placeholder="如：≥200N"></div>
      <div class="field"><label>起毛起球参考</label><input id="fb_pl" placeholder="如：3-4级"></div>
      <div class="field"><label>缩水率参考</label><input id="fb_sh" placeholder="如：3-5%"></div>
      <div class="field full"><label>备注</label><input id="fb_note" placeholder="补充说明"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitFabric()">保存面料</button>
    </div>
  `);
}
function submitFabric() {
  const name = $('#fb_name').value.trim(), comp = $('#fb_comp').value.trim(), w = $('#fb_weight').value.trim();
  if (!name || !comp || !w) { toast('请填写面料名称、成分、克重', true); return; }
  if (state.fabrics.some(f => f.name === name)) { toast('该面料已存在', true); return; }
  const ref = {
    formaldehyde: $('#fb_fa').value.trim(), ph: $('#fb_ph').value.trim(), waterColor: $('#fb_wc').value.trim(),
    rubColor: $('#fb_rc').value.trim(), strength: $('#fb_st').value.trim(), pilling: $('#fb_pl').value.trim(), shrinkage: $('#fb_sh').value.trim()
  };
  api.post('/api/fabrics', { name, composition: comp, weight: w, ref, use: $('#fb_use').value.trim(), note: $('#fb_note').value.trim() })
    .then(async () => { toast('面料已添加'); closeModal(); await loadAll(); render(); }).catch(e=>toast(e.message,true));
}
async function deleteFabric(id) {
  openModal(`<h2>确认删除</h2><p>删除该面料？</p>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDelFabric('${id}')">确认删除</button></div>`);
}
async function doDelFabric(id) { try{ await api.del(`/api/fabrics/${id}`); toast('面料已删除'); closeModal(); await loadAll(); render(); }catch(e){toast(e.message,true);} }

// ============ 供应商 ============
let supFilter = 'all';
function viewSuppliers() {
  const sups = state.suppliers;
  const list = supFilter === 'all' ? sups : sups.filter(s => s.rating === supFilter);
  return `
    <div class="page-head">
      <div><h1>供应商</h1><div class="sub">共 ${sups.length} 家</div></div>
      <button class="btn btn-primary" onclick="openSupplierForm()">＋ 新增供应商</button>
    </div>
    <div class="tabs">
      <button class="tab ${supFilter==='all'?'active':''}" onclick="supFilter='all';render()">全部</button>
      ${['A','B','C'].map(r => `<button class="tab ${supFilter===r?'active':''}" onclick="supFilter='${r}';render()">${r}级<span class="cnt">${sups.filter(s=>s.rating===r).length}</span></button>`).join('')}
    </div>
    <div class="card">
      <table>
        <thead><tr><th>编号</th><th>名称</th><th>主营类型</th><th>联系人</th><th>电话</th><th>评级</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${list.length ? list.map(s => `
            <tr>
              <td><b>${esc(s.id)}</b></td>
              <td>${esc(s.name)}</td>
              <td>${esc(s.type)}</td>
              <td>${esc(s.contact)}</td>
              <td>${esc(s.phone)}</td>
              <td><span class="badge ${s.rating==='A'?'badge-pass':s.rating==='B'?'badge-blue':'badge-gray'}">${esc(s.rating)}级</span></td>
              <td>${esc(s.status)}</td>
              <td><button class="btn btn-danger btn-sm" onclick="deleteSupplier('${s.id}')">删除</button></td>
            </tr>`).join('') : '<tr><td colspan="8" class="empty">暂无供应商</td></tr>'}
        </tbody>
      </table>
    </div>`;
}
function openSupplierForm() {
  openModal(`
    <span class="close" onclick="closeModal()">✕</span>
    <h2>新增供应商</h2>
    <div class="form-grid">
      <div class="field"><label>名称 *</label><input id="s_name"></div>
      <div class="field"><label>主营类型</label><input id="s_type"></div>
      <div class="field"><label>联系人</label><input id="s_contact"></div>
      <div class="field"><label>电话</label><input id="s_phone"></div>
      <div class="field"><label>评级</label><select id="s_rating"><option>A</option><option>B</option><option>C</option></select></div>
      <div class="field"><label>状态</label><select id="s_status"><option>合作中</option><option>试用中</option><option>已暂停</option></select></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitSupplier()">保存</button>
    </div>
  `);
}
function submitSupplier() {
  const name = $('#s_name').value.trim();
  if (!name) { toast('请填写供应商名称', true); return; }
  api.post('/api/suppliers', { name, type: $('#s_type').value, contact: $('#s_contact').value, phone: $('#s_phone').value, rating: $('#s_rating').value, status: $('#s_status').value })
    .then(async () => { toast('供应商已添加'); closeModal(); await loadAll(); render(); }).catch(e=>toast(e.message,true));
}
async function deleteSupplier(id) {
  openModal(`<h2>确认删除</h2><p>删除该供应商？</p>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDelSup('${id}')">确认删除</button></div>`);
}
async function doDelSup(id) { try{ await api.del(`/api/suppliers/${id}`); toast('供应商已删除'); closeModal(); await loadAll(); render(); }catch(e){toast(e.message,true);} }

// ============ 动态跳转 ============
function gotoItem(type, id) {
  if (type === 'ins') { insFilter='all'; switchView('inspections'); openInspectionDetail(id); }
  else { poFilter='all'; switchView('purchases'); openPoDetail(id); }
}

// ============ 事件绑定 & 初始化 ============
function bindViewEvents() {
  // 链接
  $$('#view a[data-nav]').forEach(a => a.onclick = e => { e.preventDefault(); switchView(a.dataset.nav); });
}
async function init() {
  $$('#nav a').forEach(a => a.onclick = e => { e.preventDefault(); switchView(a.dataset.view); });
  // hash 导航
  const v = (location.hash || '#dashboard').replace('#','');
  if (['dashboard','inspections','purchases','fabrics','suppliers'].includes(v)) state.view = v;
  await loadAll();
  switchView(state.view);
}
// 全局暴露
window.gotoItem = gotoItem;
document.addEventListener('DOMContentLoaded', init);
