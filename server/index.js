const path = require('path');
const fs = require('fs');
const express = require('express');
const { db, mode } = require('./db');

const PORT = process.env.PORT || 3001;

// ---------- 种子数据 ----------
const STANDARDS = [
  { id: 'gb18401', name: 'GB 18401-2010 国家纺织产品基本安全技术规范', type: 'basic' },
  { id: 'gb3923', name: 'GB/T 3923.1 织物拉伸性能（断裂强力）', type: 'fabric' },
  { id: 'gb4802', name: 'GB/T 4802.2 织物起毛起球（马丁代尔法）', type: 'fabric' },
  { id: 'gb8629', name: 'GB/T 8629 纺织品 试验用家庭洗涤（缩水率）', type: 'fabric' },
  { id: 'gb3921', name: 'GB/T 3921 色牢度试验 耐水洗色牢度', type: 'fabric' },
  { id: 'fzt', name: 'FZ/T 通用面料测试标准', type: 'fabric' }
];

const PROJECTS = [
  { key: 'formaldehyde', name: '甲醛含量', unit: 'mg/kg', desc: '甲醛含量（mg/kg）' },
  { key: 'ph', name: 'pH值', unit: '', desc: 'pH值' },
  { key: 'waterColor', name: '耐水洗色牢度', unit: '级', desc: '耐水洗色牢度（级）' },
  { key: 'rubColor', name: '耐摩擦色牢度', unit: '级', desc: '耐干摩擦色牢度（级）' },
  { key: 'azo', name: '可分解致癌芳香胺染料', unit: 'mg/kg', desc: '可分解致癌芳香胺染料（mg/kg）' },
  { key: 'odor', name: '异味', unit: '', desc: '异味（要求：无）' },
  { key: 'strength', name: '断裂强力', unit: 'N', desc: '断裂强力（N）' },
  { key: 'pilling', name: '起毛起球', unit: '级', desc: '起毛起球（级）' },
  { key: 'shrinkage', name: '缩水率', unit: '%', desc: '缩水率（%）' },
  { key: 'fiber', name: '纤维含量', unit: '%', desc: '纤维含量（%）' }
];

// 检测项目限值(按安全类别 A/B/C)
const LIMITS = {
  formaldehyde: { unit: 'mg/kg', A: { max: 20 }, B: { max: 75 }, C: { max: 300 }, type: 'max' },
  ph: { unit: '', A: { min: 4.0, max: 7.5 }, B: { min: 4.0, max: 8.5 }, C: { min: 4.0, max: 9.0 }, type: 'range' },
  waterColor: { unit: '级', A: { min: 3.4 }, B: { min: 3.4 }, C: { min: 3 }, type: 'min' },
  rubColor: { unit: '级', A: { min: 4 }, B: { min: 3.4 }, C: { min: 3 }, type: 'min' },
  azo: { unit: 'mg/kg', A: { max: 20 }, B: { max: 20 }, C: { max: 20 }, type: 'max' },
  odor: { unit: '', A: { none: true }, B: { none: true }, C: { none: true }, type: 'none' },
  strength: { unit: 'N', A: { min: 200 }, B: { min: 200 }, C: { min: 200 }, type: 'min' },
  pilling: { unit: '级', A: { min: 3.4 }, B: { min: 3.4 }, C: { min: 3 }, type: 'min' },
  shrinkage: { unit: '%', A: { max: 3 }, B: { max: 3 }, C: { max: 3 }, type: 'max' },
  fiber: { unit: '%', A: { min: 0, max: 100 }, B: { min: 0, max: 100 }, C: { min: 0, max: 100 }, type: 'range' }
};

const SUPPLIERS = [
  { id: 'SUP001', name: '泉州宏远纺织有限公司', type: '棉麻类', contact: '林经理', phone: '13900001111', rating: 'A', status: '合作中' },
  { id: 'SUP002', name: '绍兴柯桥天赐化纤', type: '化纤类', contact: '陈总', phone: '13800002222', rating: 'A', status: '合作中' },
  { id: 'SUP003', name: '广州锦江真丝贸易', type: '丝绸类', contact: '王女士', phone: '13700003333', rating: 'B', status: '合作中' },
  { id: 'SUP004', name: '苏州苏豪毛纺', type: '毛纺类', contact: '张工', phone: '13600004444', rating: 'B', status: '试用中' },
  { id: 'SUP005', name: '东莞联丰混纺科技', type: '混纺类', contact: '李总', phone: '13500005555', rating: 'C', status: '已暂停' }
];

const FABRICS = [
  { id: 'F001', name: '全棉平纹布', composition: '100%棉', weight: '120-160 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-7.5', waterColor: '3-4级', rubColor: '3-4级', strength: '≥200N', pilling: '3-4级', shrinkage: '3-5%' }, use: 'T恤、衬衫、床品', note: '透气亲肤，易缩水' },
  { id: 'F002', name: '涤纶斜纹布', composition: '100%涤纶', weight: '150-200 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-8.0', waterColor: '4级', rubColor: '4级', strength: '≥250N', pilling: '3-4级', shrinkage: '1-2%' }, use: '运动服、夹克', note: '强力高，缩水小，耐穿' },
  { id: 'F003', name: '羊毛大衣呢', composition: '80%羊毛/20%化纤', weight: '300-500 g/m²', ref: { formaldehyde: '≤20', ph: '5.0-7.0', waterColor: '3级', rubColor: '3级', strength: '≥150N', pilling: '3级', shrinkage: '≥5%' }, use: '大衣、西服', note: '易起球，需干洗' },
  { id: 'F004', name: '桑蚕丝素绉缎', composition: '100%桑蚕丝', weight: '60-90 g/m²', ref: { formaldehyde: '≤20', ph: '5.5-7.0', waterColor: '2-3级', rubColor: '2-3级', strength: '≥120N', pilling: '2-3级', shrinkage: '2-3%' }, use: '衬衫、连衣裙', note: '强力较低，娇贵需手洗' },
  { id: 'F005', name: '亚麻平纹布', composition: '100%亚麻', weight: '120-180 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-7.5', waterColor: '3级', rubColor: '3级', strength: '≥220N', pilling: '3级', shrinkage: '3-4%' }, use: '夏装、窗帘', note: '凉爽透气，易皱' },
  { id: 'F006', name: '棉涤混纺布', composition: '65%棉/35%涤', weight: '130-170 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-7.5', waterColor: '3-4级', rubColor: '3-4级', strength: '≥230N', pilling: '3-4级', shrinkage: '2-3%' }, use: '衬衫、工装', note: '综合棉的舒适与涤的挺括' },
  { id: 'F007', name: '锦纶塔丝隆', composition: '100%锦纶', weight: '100-160 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-8.0', waterColor: '4级', rubColor: '4级', strength: '≥300N', pilling: '4级', shrinkage: '1-2%' }, use: '冲锋衣、背包', note: '耐磨强力极高' },
  { id: 'F008', name: '粘胶人棉', composition: '100%粘胶', weight: '90-140 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-7.5', waterColor: '3级', rubColor: '3级', strength: '≥100N', pilling: '3级', shrinkage: '4-6%' }, use: '连衣裙、衬衣', note: '悬垂好，湿强低易缩水' },
  { id: 'F009', name: '棉氨纶弹力布', composition: '92%棉/8%氨纶', weight: '160-220 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-7.5', waterColor: '3-4级', rubColor: '3-4级', strength: '≥200N', pilling: '3-4级', shrinkage: '3-4%' }, use: 'T恤、瑜伽裤', note: '弹性佳，回弹好' },
  { id: 'F010', name: '天丝莱赛尔', composition: '100%莱赛尔', weight: '100-150 g/m²', ref: { formaldehyde: '≤20', ph: '6.0-7.5', waterColor: '3-4级', rubColor: '3-4级', strength: '≥150N', pilling: '3-4级', shrinkage: '3-4%' }, use: '衬衫、夏装', note: '环保再生，手感柔软' }
];

// 依据限值计算某项目的实测值是否合格
function judgeValue(key, value, cat) {
  const L = LIMITS[key];
  if (!L || value === undefined || value === null || value === '') return true;
  const lm = L[cat] || L.B;
  if (L.type === 'none') return true;
  if (L.type === 'max') return Number(value) <= lm.max;
  if (L.type === 'min') return Number(value) >= lm.min;
  if (L.type === 'range') { const v = Number(value); return v >= lm.min && v <= lm.max; }
  return true;
}
const seedInspections = () => {
  const now = Date.now();
  const mk = (id, fabricName, cat, projects, submitter) => {
    const overall = projects.every(p => judgeValue(p.key, p.value, cat)) ? 'pass' : 'fail';
    return {
      id, fabricName, fabricId: 'F' + id.slice(-2),
      composition: FABRICS.find(f => f.name === fabricName)?.composition || '100%棉',
      weight: FABRICS.find(f => f.name === fabricName)?.weight || '120 g/m²',
      supplier: 'SUP001', standard: 'gb18401', category: cat,
      submitter, createdAt: new Date(now - Math.floor(Math.random() * 5e6)).toISOString(),
      projects, overallResult: overall, quality: overall === 'pass' ? '一等' : '不合格', note: overall === 'pass' ? '检测合格，可采购' : '存在不合格项，需复核'
    };
  };
  return [
    mk('DET001', '全棉平纹布', 'B', [
      { key: 'formaldehyde', value: 18 }, { key: 'ph', value: 6.5 }, { key: 'waterColor', value: 3.5 }, { key: 'rubColor', value: 4 }, { key: 'azo', value: 5 }, { key: 'odor', value: '无' }, { key: 'strength', value: 220 }, { key: 'pilling', value: 3.5 }, { key: 'shrinkage', value: 2.5 }
    ], 'admin'),
    mk('DET002', '涤纶斜纹布', 'B', [
      { key: 'formaldehyde', value: 15 }, { key: 'ph', value: 7.0 }, { key: 'waterColor', value: 4 }, { key: 'rubColor', value: 4 }, { key: 'azo', value: 3 }, { key: 'odor', value: '无' }, { key: 'strength', value: 280 }, { key: 'pilling', value: 4 }, { key: 'shrinkage', value: 1.2 }
    ], 'admin'),
    mk('DET003', '羊毛大衣呢', 'B', [
      { key: 'formaldehyde', value: 22 }, { key: 'ph', value: 6.0 }, { key: 'waterColor', value: 3 }, { key: 'rubColor', value: 3 }, { key: 'azo', value: 5 }, { key: 'odor', value: '无' }, { key: 'strength', value: 160 }, { key: 'pilling', value: 2.5 }, { key: 'shrinkage', value: 6 }
    ], 'admin'),
    mk('DET004', '桑蚕丝素绉缎', 'B', [
      { key: 'formaldehyde', value: 12 }, { key: 'ph', value: 6.2 }, { key: 'waterColor', value: 3 }, { key: 'rubColor', value: 3 }, { key: 'azo', value: 2 }, { key: 'odor', value: '无' }, { key: 'strength', value: 130 }, { key: 'pilling', value: 3 }, { key: 'shrinkage', value: 2.5 }
    ], 'admin'),
    mk('DET005', '亚麻平纹布', 'B', [
      { key: 'formaldehyde', value: 19 }, { key: 'ph', value: 6.5 }, { key: 'waterColor', value: 3 }, { key: 'rubColor', value: 3 }, { key: 'azo', value: 6 }, { key: 'odor', value: '无' }, { key: 'strength', value: 230 }, { key: 'pilling', value: 3 }, { key: 'shrinkage', value: 3.5 }
    ], 'admin'),
    mk('DET006', '棉涤混纺布', 'B', [
      { key: 'formaldehyde', value: 16 }, { key: 'ph', value: 6.8 }, { key: 'waterColor', value: 3.5 }, { key: 'rubColor', value: 4 }, { key: 'azo', value: 4 }, { key: 'odor', value: '无' }, { key: 'strength', value: 240 }, { key: 'pilling', value: 3.5 }, { key: 'shrinkage', value: 2.2 }
    ], 'admin'),
    mk('DET007', '锦纶塔丝隆', 'B', [
      { key: 'formaldehyde', value: 14 }, { key: 'ph', value: 7.0 }, { key: 'waterColor', value: 4 }, { key: 'rubColor', value: 4 }, { key: 'azo', value: 3 }, { key: 'odor', value: '无' }, { key: 'strength', value: 320 }, { key: 'pilling', value: 4 }, { key: 'shrinkage', value: 1.5 }
    ], 'admin'),
    mk('DET008', '粘胶人棉', 'B', [
      { key: 'formaldehyde', value: 25 }, { key: 'ph', value: 7.2 }, { key: 'waterColor', value: 2.5 }, { key: 'rubColor', value: 3 }, { key: 'azo', value: 8 }, { key: 'odor', value: '无' }, { key: 'strength', value: 110 }, { key: 'pilling', value: 3 }, { key: 'shrinkage', value: 5 }
    ], 'admin')
  ];
};

const seedPurchases = () => {
  const now = Date.now();
  return [
    { id: 'PO001', inspectionId: 'DET001', fabricId: 'F001', fabricName: '全棉平纹布', qty: 5000, unit: '米', price: 18, amount: 90000, supplier: 'SUP001', dueDate: new Date(now + 20 * 864e5).toISOString().slice(0, 10), reason: '秋冬T恤面料备货', status: '待审批', applicant: 'admin', createdAt: new Date(now - 3 * 864e5).toISOString() },
    { id: 'PO002', inspectionId: 'DET002', fabricId: 'F002', fabricName: '涤纶斜纹布', qty: 8000, unit: '米', price: 14, amount: 112000, supplier: 'SUP002', dueDate: new Date(now + 15 * 864e5).toISOString().slice(0, 10), reason: '运动服批量采购', status: '待付款', applicant: 'admin', createdAt: new Date(now - 2 * 864e5).toISOString() },
    { id: 'PO003', inspectionId: 'DET006', fabricId: 'F006', fabricName: '棉涤混纺布', qty: 3000, unit: '米', price: 16, amount: 48000, supplier: 'SUP003', dueDate: new Date(now + 30 * 864e5).toISOString().slice(0, 10), reason: '衬衫面料补货', status: '已下单', applicant: 'admin', createdAt: new Date(now - 1 * 864e5).toISOString() }
  ];
};

// ---------- 建表 & 播种 ----------
async function initDb() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY, fabricId TEXT, fabricName TEXT, composition TEXT, weight TEXT,
  supplier TEXT, standard TEXT, category TEXT, submitter TEXT, createdAt TEXT,
  projects TEXT, overallResult TEXT, quality TEXT, note TEXT, isDraft INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, inspectionId TEXT, fabricId TEXT, fabricName TEXT, qty INTEGER, unit TEXT,
  price REAL, amount REAL, supplier TEXT, dueDate TEXT, reason TEXT, status TEXT,
  applicant TEXT, createdAt TEXT
);
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, contact TEXT, phone TEXT, rating TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS fabrics (
  id TEXT PRIMARY KEY, name TEXT, composition TEXT, weight TEXT, ref TEXT, use TEXT, note TEXT
);
`);
  const insCount = (await db.get('SELECT COUNT(*) c FROM inspections')).c;
  if (insCount === 0) {
    const seed = seedInspections();
    for (const i of seed) {
      await db.run(`INSERT INTO inspections (id,fabricId,fabricName,composition,weight,supplier,standard,category,submitter,createdAt,projects,overallResult,quality,note,isDraft) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [i.id, i.fabricId, i.fabricName, i.composition, i.weight, i.supplier, i.standard, i.category, i.submitter, i.createdAt, JSON.stringify(i.projects), i.overallResult, i.quality, i.note, 0]);
    }
  }
  if ((await db.get('SELECT COUNT(*) c FROM purchases')).c === 0) {
    for (const p of seedPurchases()) {
      await db.run(`INSERT INTO purchases (id,inspectionId,fabricId,fabricName,qty,unit,price,amount,supplier,dueDate,reason,status,applicant,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.inspectionId, p.fabricId, p.fabricName, p.qty, p.unit, p.price, p.amount, p.supplier, p.dueDate, p.reason, p.status, p.applicant, p.createdAt]);
    }
  }
  if ((await db.get('SELECT COUNT(*) c FROM suppliers')).c === 0) {
    for (const s of SUPPLIERS) {
      await db.run(`INSERT INTO suppliers (id,name,type,contact,phone,rating,status) VALUES (?,?,?,?,?,?,?)`, [s.id, s.name, s.type, s.contact, s.phone, s.rating, s.status]);
    }
  }
  if ((await db.get('SELECT COUNT(*) c FROM fabrics')).c === 0) {
    for (const f of FABRICS) {
      await db.run(`INSERT INTO fabrics (id,name,composition,weight,ref,use,note) VALUES (?,?,?,?,?,?,?)`, [f.id, f.name, f.composition, f.weight, JSON.stringify(f.ref), f.use, f.note]);
    }
  }
}

// ---------- Express ----------
const app = express();
app.use(express.json());

// 静态托管前端
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/meta', (req, res) => res.json({ standards: STANDARDS, projects: PROJECTS, limits: LIMITS }));

// inspections
app.get('/api/inspections', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM inspections ORDER BY createdAt DESC');
    res.json(rows.map(r => ({ ...r, projects: JSON.parse(r.projects) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/inspections', async (req, res) => {
  try {
    const b = req.body;
    const id = b.id || 'DET' + String(Date.now()).slice(-6);
    await db.run(`INSERT INTO inspections (id,fabricId,fabricName,composition,weight,supplier,standard,category,submitter,createdAt,projects,overallResult,quality,note,isDraft) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, b.fabricId, b.fabricName, b.composition, b.weight, b.supplier, b.standard, b.category, b.submitter, b.createdAt, JSON.stringify(b.projects), b.overallResult, b.quality, b.note, b.isDraft ? 1 : 0]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/inspections/:id', async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE inspections SET fabricId=?,fabricName=?,composition=?,weight=?,supplier=?,standard=?,category=?,submitter=?,projects=?,overallResult=?,quality=?,note=?,isDraft=? WHERE id=?`,
      [b.fabricId, b.fabricName, b.composition, b.weight, b.supplier, b.standard, b.category, b.submitter, JSON.stringify(b.projects), b.overallResult, b.quality, b.note, b.isDraft ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/inspections/:id', async (req, res) => {
  try { await db.run('DELETE FROM inspections WHERE id=?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// purchases
app.get('/api/purchases', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM purchases ORDER BY createdAt DESC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/purchases', async (req, res) => {
  try {
    const b = req.body;
    const id = b.id || 'PO' + String(Date.now()).slice(-6);
    await db.run(`INSERT INTO purchases (id,inspectionId,fabricId,fabricName,qty,unit,price,amount,supplier,dueDate,reason,status,applicant,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, b.inspectionId, b.fabricId, b.fabricName, b.qty, b.unit, b.price, b.amount, b.supplier, b.dueDate, b.reason, b.status, b.applicant, b.createdAt]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/purchases/:id', async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE purchases SET status=?,qty=?,price=?,amount=?,dueDate=?,reason=?,supplier=? WHERE id=?`,
      [b.status, b.qty, b.price, b.amount, b.dueDate, b.reason, b.supplier, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/purchases/:id', async (req, res) => {
  try { await db.run('DELETE FROM purchases WHERE id=?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// suppliers
app.get('/api/suppliers', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM suppliers')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/suppliers', async (req, res) => {
  try {
    const b = req.body;
    const id = b.id || 'SUP' + String(Date.now()).slice(-6);
    await db.run(`INSERT INTO suppliers (id,name,type,contact,phone,rating,status) VALUES (?,?,?,?,?,?,?)`, [id, b.name, b.type, b.contact, b.phone, b.rating, b.status]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/suppliers/:id', async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE suppliers SET name=?,type=?,contact=?,phone=?,rating=?,status=? WHERE id=?`, [b.name, b.type, b.contact, b.phone, b.rating, b.status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/suppliers/:id', async (req, res) => {
  try { await db.run('DELETE FROM suppliers WHERE id=?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// fabrics
app.get('/api/fabrics', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM fabrics');
    res.json(rows.map(r => ({ ...r, ref: JSON.parse(r.ref) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/fabrics', async (req, res) => {
  try {
    const b = req.body;
    const id = b.id || 'F' + String(Date.now()).slice(-6);
    await db.run(`INSERT INTO fabrics (id,name,composition,weight,ref,use,note) VALUES (?,?,?,?,?,?,?)`, [id, b.name, b.composition, b.weight, JSON.stringify(b.ref), b.use, b.note]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/fabrics/:id', async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE fabrics SET name=?,composition=?,weight=?,ref=?,use=?,note=? WHERE id=?`, [b.name, b.composition, b.weight, JSON.stringify(b.ref), b.use, b.note, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/fabrics/:id', async (req, res) => {
  try { await db.run('DELETE FROM fabrics WHERE id=?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// 启动：先初始化数据库，再监听
initDb().then(() => {
  app.listen(PORT, () => console.log(`[fabric-platform] 后端已启动(${mode}模式): http://localhost:${PORT}`));
}).catch(e => { console.error('数据库初始化失败:', e); process.exit(1); });
