const DB_KEY = "todo_xml_data";
let gorevler = [];
let aramaMetni = "";
let aktifFiltre = "all";
let editId = null;
let currentHandle = null;
const acikDetaylar = new Set();

const form = document.getElementById('taskForm');
const listElement = document.getElementById('taskList');
const counterLabel = document.getElementById('taskCounter');
const filterContainer = document.getElementById('filterBtns');

function init() {
    gorevler = loadData();
    setupEventListeners();
    render();
}

function setupEventListeners() {
    form.onsubmit = (e) => {
        e.preventDefault();
        const baslik = document.getElementById('titleInp').value.trim();
        const aciklama = document.getElementById('descInp').value.trim();
        
        if (editId) {
            gorevler = gorevler.map(t => t.id === editId ? { ...t, title: baslik, description: aciklama } : t);
            editId = null;
            document.getElementById('mainActionBtn').textContent = "Ekle";
        } else {
            gorevler.unshift({
                id: crypto.randomUUID(),
                title: baslik,
                description: aciklama,
                status: 'todo',
                date: Date.now()
            });
        }
        form.reset();
        kaydet();
    };

    document.getElementById('searchInp').oninput = (e) => {
        aramaMetni = e.target.value.toLowerCase();
        render();
    };

    filterContainer.onclick = (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        aktifFiltre = btn.dataset.status;
        Array.from(filterContainer.children).forEach(c => c.classList.toggle('active', c === btn));
        render();
    };

    document.getElementById('btnExport').onclick = exportToXml;
    document.getElementById('btnLoad').onclick = importFromXml;
}

function render() {
    listElement.innerHTML = '';
    const filtered = gorevler.filter(t => {
        const matchStatus = aktifFiltre === 'all' || t.status === aktifFiltre;
        const matchSearch = t.title.toLowerCase().includes(aramaMetni) || (t.description || "").toLowerCase().includes(aramaMetni);
        return matchStatus && matchSearch;
    });

    counterLabel.textContent = `${filtered.length} görev`;

    if (filtered.length === 0) {
        listElement.appendChild(document.getElementById('emptyTpl').content.cloneNode(true));
        return;
    }

    filtered.forEach((t, index) => {
        const isExpanded = acikDetaylar.has(t.id);
        const li = document.createElement('li');
        li.className = `item-row ${t.status !== 'todo' ? t.status : ''}`;
        
        const siralaKapali = aramaMetni || aktifFiltre !== 'all';

        li.innerHTML = `
            <div class="row-main">
                <button class="btn-icon" onclick="move('${t.id}', -1)" ${siralaKapali || index === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn-icon" onclick="move('${t.id}', 1)" ${siralaKapali || index === filtered.length - 1 ? 'disabled' : ''}>↓</button>
                <span class="title-text">${temizle(t.title)}</span>
                <button class="btn-icon" onclick="toggleDetay('${t.id}')">${isExpanded ? '▲' : '▼'}</button>
                <button class="btn-icon" onclick="sil('${t.id}')">✕</button>
            </div>
            <div class="item-details" ${isExpanded ? '' : 'hidden'}>
                <p>${temizle(t.description) || '<i>Açıklama yok.</i>'}</p>
                <div class="action-group">
                    <button class="secondary-btn" onclick="duzenle('${t.id}')">Düzenle</button>
                    <button class="btn-icon ${t.status==='complete'?'active':''}" onclick="durumGuncelle('${t.id}', 'complete')">✓</button>
                    <button class="btn-icon ${t.status==='todo'?'active':''}" onclick="durumGuncelle('${t.id}', 'todo')">≡</button>
                    <button class="btn-icon ${t.status==='in-progress'?'active':''}" onclick="durumGuncelle('${t.id}', 'in-progress')">⏳</button>
                </div>
            </div>
        `;
        listElement.appendChild(li);
    });
}

window.toggleDetay = (id) => { acikDetaylar.has(id) ? acikDetaylar.delete(id) : acikDetaylar.add(id); render(); };
window.sil = (id) => { gorevler = gorevler.filter(t => t.id !== id); kaydet(); };
window.durumGuncelle = (id, s) => { gorevler = gorevler.map(t => t.id === id ? {...t, status: s} : t); kaydet(); };
window.duzenle = (id) => {
    const t = gorevler.find(x => x.id === id);
    editId = id;
    document.getElementById('titleInp').value = t.title;
    document.getElementById('descInp').value = t.description || "";
    document.getElementById('mainActionBtn').textContent = "Kaydet";
    document.getElementById('titleInp').focus();
};
window.move = (id, yon) => {
    const idx = gorevler.findIndex(t => t.id === id);
    if (idx + yon < 0 || idx + yon >= gorevler.length) return;
    [gorevler[idx], gorevler[idx+yon]] = [gorevler[idx+yon], gorevler[idx]];
    kaydet();
};

function temizle(s) {
    if (!s) return "";
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

function kaydet() {
    const xml = buildXml(gorevler);
    localStorage.setItem(DB_KEY, xml);
    if (currentHandle) syncFile(xml);
    render();
}

function buildXml(data) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?><tasks>';
    data.forEach(t => {
        xml += `<task><id>${t.id}</id><title>${temizle(t.title)}</title><description>${temizle(t.description)}</description><status>${t.status}</status><date>${t.date}</date></task>`;
    });
    xml += '</tasks>';
    return xml;
}

function loadData() {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? parseXml(raw) : [];
}

function parseXml(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    if (doc.querySelector("parsererror")) return [];
    
    return Array.from(doc.querySelectorAll("task")).map(n => {
        const getVal = (tag) => n.querySelector(tag)?.textContent || "";
        return {
            id: getVal("id") || crypto.randomUUID(),
            title: getVal("title"),
            description: getVal("description"),
            status: getVal("status") || "todo",
            date: Number(getVal("date")) || Date.now()
        };
    });
}

async function importFromXml() {
    const [h] = await window.showOpenFilePicker({ types: [{ accept: { "text/xml": [".xml"] } }] });
    if (!h) return;
    currentHandle = h;
    const file = await h.getFile();
    gorevler = parseXml(await file.text());
    kaydet();
}

function exportToXml() {
    const blob = new Blob([buildXml(gorevler)], { type: "text/xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "todo_list.xml";
    link.click();
}

async function syncFile(content) {
    if (!currentHandle) return;
    const writer = await currentHandle.createWritable();
    await writer.write(content);
    await writer.close();
}

init();