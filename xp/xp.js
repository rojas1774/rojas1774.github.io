// Late Shipment: an interactive 3D video.
// The "video" is a live three.js render of a world modelled in Blender (assets/world.glb),
// directed chapter by chapter with GSAP, narrated line by line (audio/*.mp3, word-timed captions),
// and paused wherever the learner has to act directly in the scene.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gsap = window.gsap;
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = d => (RM ? 0.001 : d);
const xp = $('#xp');
const TEST = new URLSearchParams(location.search).has('test'); // drives time with timers so hidden tabs can be tested
if (TEST) gsap.ticker.lagSmoothing(0);
const FAST = new URLSearchParams(location.search).has('fast') ? 2.5 : 1; // test only: run the lesson faster

// ------------------------------------------------------------------ lesson data (all fictional)
const UNIT = 5; // one crate = 5 units
const CASES = {
  practice: {
    item: 'BK-200', name: 'hydraulic brake kits', unit: 'kits', supplier: 'Delta Components', delay: 'two weeks later',
    stock: [100, 100, -50, 150, 70, 70], shortWeek: 3, customer: 'Harbour Bikes', qty: 150, pre: 100, short: 50,
    options: [
      { key: 'wait', icon: '⏳', title: 'Do nothing', cost: '$0', note: 'Order ships a week late', at: 'factory', fb: 'F_WAIT', ok: false },
      { key: 'split', icon: '✂', title: 'Split the order', cost: '$250', note: '100 now, 50 in week 4', at: 'shop', fb: 'F_SPLIT', ok: false },
      { key: 'air', icon: '✈', title: 'Air-freight 50 kits', cost: '$1,800', note: 'Lands week 3, complete', at: 'sky', fb: 'F_AIR', ok: true },
    ],
  },
  test: {
    item: 'WH-310', name: '29-inch wheel sets', unit: 'sets', supplier: 'Kestrel Rims', delay: 'one week later',
    stock: [60, -30, 90, 50, 50, 50], shortWeek: 2, customer: 'Coastline Sports', qty: 90, pre: 60, short: 30,
    options: [
      { key: 'air', icon: '✈', title: 'Air-freight 30 sets', cost: '$3,100', note: 'Lands week 2, complete', at: 'skyRight', fb: 'FT_AIR', ok: false },
      { key: 'wait', icon: '⏳', title: 'Do nothing', cost: '$0', note: 'Order ships a week late', at: 'factory', fb: 'FT_WAIT', ok: false },
      { key: 'transfer', icon: '⇄', title: 'Transfer 30 from Halifax', cost: '$400', note: 'Arrives week 2, complete', at: 'halifax', fb: 'FT_TRANSFER', ok: true },
    ],
  },
};
let CASE = CASES.practice;
const score = { weekMistakes: 0, choiceMistakes: 0, testWeek: 0, testChoice: 0 };

// ------------------------------------------------------------------ renderer, scene, lights
const stageEl = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xeef2f4, 90, 170);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
const camBase = new THREE.Vector3(-26, 24, 44);
const camTarget = new THREE.Vector3(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xe8f2ff, 0xbfa88f, 1.75));
const sun = new THREE.DirectionalLight(0xfff2e2, 2.3);
sun.position.set(14, 24, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const float = new THREE.Group(); // the island bobs gently
scene.add(float);

// ------------------------------------------------------------------ world objects
let W = {};           // named nodes
const slots = [];     // crate slot positions (world-root space)
const crates = [];    // real crates
const ghosts = [];    // missing stock, shown as red outlines
let crateTpl;

async function loadWorld(onProgress) {
  const gltf = await new GLTFLoader().loadAsync('assets/world.glb', e => e.total && onProgress(e.loaded / e.total));
  float.add(gltf.scene);
  gltf.scene.traverse(o => {
    if (o.name) W[o.name] = o;
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  crateTpl = W.Crate;
  crateTpl.visible = false;
  for (let i = 0; i < 72; i++) slots.push(W[`Slot_${String(i).padStart(2, '0')}`].position.clone());
  // fill order: the visible front row first (bottom shelf up, left to right), then rows further back
  slots.sort((a, b) => b.z - a.z || a.y - b.y || a.x - b.x);
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xe5484d, transparent: true, opacity: 0.35, emissive: 0xe5484d, emissiveIntensity: 0.35, depthWrite: false });
  for (let i = 0; i < 44; i++) {
    const c = crateTpl.clone(); c.visible = true; c.scale.setScalar(0.0001);
    c.position.copy(slots[i]).add(new THREE.Vector3(0, 0.22, 0));
    c.rotation.y = (Math.random() - 0.5) * 0.12;
    gltf.scene.add(c); crates.push(c);
  }
  for (let i = 0; i < 14; i++) {
    const g = crateTpl.clone(); g.visible = true; g.scale.setScalar(0.0001);
    g.traverse(o => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; } });
    g.position.copy(slots[i]).add(new THREE.Vector3(0, 0.22, 0));
    gltf.scene.add(g); ghosts.push(g);
  }
  W.roofY = W.WarehouseRoof.position.y;
  W.truckHome = W.Truck.position.clone();
  W.truck2Home = W.Truck2.position.clone();
  W.truck2Rot = W.Truck2.rotation.y;
  W.routeMain = [0, 1, 2, 3].map(i => W[`Route_Main_${i}`].position.clone());
  W.routeHalifax = [0, 1, 2, 3, 4, 5].map(i => W[`Route_Halifax_${i}`].position.clone());
  W.Plane.visible = false;
  // keep clouds out of the camera paths
  [[-24, 16, -12], [26, 18, -6], [6, 20, -26], [-14, 14, -24]].forEach((p, i) => W.Clouds.children[i]?.position.set(...p));
}

const anchorPos = {
  factory: () => wp(W.Anchor_Factory), warehouse: () => wp(W.Anchor_Warehouse), shop: () => wp(W.Anchor_Shop),
  halifax: () => wp(W.Anchor_Halifax), sky: () => float.localToWorld(new THREE.Vector3(0, 7.2, -1)),
  skyRight: () => float.localToWorld(new THREE.Vector3(6.5, 7.5, -3)),
  truck: () => wp(W.Truck).add(new THREE.Vector3(0, 2.4, 0)),
};
function wp(o) { return o.getWorldPosition(new THREE.Vector3()); }

// beacon ring above the flagged truck
const beacon = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 48), new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, side: THREE.DoubleSide, depthTest: false }));
beacon.renderOrder = 10; beacon.visible = false; scene.add(beacon);

// ------------------------------------------------------------------ stock on the shelves
let shownStock = null;
function setShelves(real, ghost, animate = true) {
  const n = Math.max(0, Math.min(crates.length, real)), g = Math.max(0, Math.min(ghosts.length, ghost));
  crates.forEach((c, i) => {
    const on = i < n; const s = on ? 1 : 0.0001;
    gsap.killTweensOf(c.scale);
    if (Math.abs(c.scale.x - s) < 0.01) return;
    gsap.to(c.scale, { x: s, y: s, z: s, duration: animate ? D(0.35) : 0, ease: on ? 'back.out(2)' : 'power2.in', delay: animate ? Math.abs(i - n) * 0.012 : 0 });
  });
  ghosts.forEach((c, i) => {
    const on = i < g; const s = on ? 1 : 0.0001;
    gsap.killTweensOf(c.scale);
    if (on) c.position.copy(slots[Math.min(slots.length - 1, n + i)]).add(new THREE.Vector3(0, 0.22, 0));
    if (Math.abs(c.scale.x - s) < 0.01) return;
    gsap.to(c.scale, { x: s, y: s, z: s, duration: animate ? D(0.3) : 0, ease: 'power2.out', delay: animate ? i * 0.02 : 0 });
  });
}
function showStock(v, animate = true) {
  shownStock = v;
  setShelves(Math.round(Math.max(0, v) / UNIT), v < 0 ? Math.round(-v / UNIT) : 0, animate);
}

// ------------------------------------------------------------------ camera shots
const SHOTS = {
  intro: { p: [-26, 24, 44], t: [0, 0, 0] },
  overview: { p: [0, 13, 34], t: [0, -0.5, 0] },
  factory: { p: [-4.5, 5.2, 12.5], t: [-7.8, 1, 2.8] },
  warehouse: { p: [0.4, 5.6, 8.4], t: [0, 1.2, -1] },
  shop: { p: [5.2, 4.8, 10.2], t: [9, 1.5, -0.6] },
  options: { p: [0, 19.5, 27.5], t: [0, 4.6, -1] },
};
function shot(name, dur = 2.2, ease = 'power2.inOut') {
  const s = SHOTS[name];
  const t = new THREE.Vector3(...s.t), p = new THREE.Vector3(...s.p);
  const aspect = camera.aspect, k = aspect < 0.8 ? 1.75 : aspect < 1.3 ? 1.3 : 1;
  p.sub(t).multiplyScalar(k).add(t);
  const tl = gsap.timeline();
  tl.to(camBase, { x: p.x, y: p.y, z: p.z, duration: D(dur), ease }, 0);
  tl.to(camTarget, { x: t.x, y: t.y, z: t.z, duration: D(dur), ease }, 0);
  return tl;
}
function cut(name) { shot(name, 0).progress(1); }

// ------------------------------------------------------------------ movers
function drive(obj, pts, speed = 3.2) {
  const tl = gsap.timeline();
  let prev = obj.position.clone(), cur = obj.rotation.y;
  for (const p of pts) {
    const d = prev.distanceTo(p);
    if (d < 0.01) continue;
    let to = Math.atan2(-(p.z - prev.z), p.x - prev.x); // shortest turn
    while (to - cur > Math.PI) to -= Math.PI * 2; while (to - cur < -Math.PI) to += Math.PI * 2;
    tl.to(obj.rotation, { y: to, duration: D(0.3), ease: 'power1.inOut' });
    tl.to(obj.position, { x: p.x, z: p.z, duration: D(d / speed), ease: 'none' }, '<0.1');
    cur = to; prev = p.clone();
  }
  return tl;
}
function resetTrucks() {
  gsap.killTweensOf([W.Truck.position, W.Truck.rotation, W.Truck2.position, W.Truck2.rotation]);
  W.Truck.position.copy(W.truckHome); W.Truck.rotation.set(0, 0, 0);
  W.Truck2.position.copy(W.truck2Home); W.Truck2.rotation.set(0, W.truck2Rot, 0);
}
const slotPos = i => slots[i].clone().add(new THREE.Vector3(0, 0.22, 0));
function flyCrates(count, delayStep = 0.05) {
  // lift crates 0..count-1 off the shelves and arc them into the shop
  const tl = gsap.timeline();
  for (let i = 0; i < count; i++) {
    const c = crates[i], a = slotPos(i), o = { t: 0 };
    let b, mid;
    tl.to(o, { t: 1, duration: D(1.1), ease: 'power1.inOut',
      onStart: () => { b = float.worldToLocal(anchorPos.shop().setY(0.6)).add(new THREE.Vector3(0, 0, 1.6)); mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 4.5, 0)); },
      onUpdate: () => { const t = o.t, u = 1 - t; c.position.set(u * u * a.x + 2 * u * t * mid.x + t * t * b.x, u * u * a.y + 2 * u * t * mid.y + t * t * b.y, u * u * a.z + 2 * u * t * mid.z + t * t * b.z); },
      onComplete: () => { c.scale.setScalar(0.0001); c.position.copy(a); } }, i * delayStep);
  }
  return tl;
}
function airDrop(from, count) {
  const P = W.Plane; P.visible = true;
  P.position.set(-48, 13.5, -1); P.rotation.set(0, 0, 0);
  const tl = gsap.timeline();
  tl.to(P.position, { x: 48, y: 15, duration: D(6), ease: 'none' });
  tl.to(P.rotation, { x: -0.12, duration: D(1.5), yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.5);
  // crates drop from the belly as the plane crosses the warehouse, filling the red gaps
  for (let k = 0; k < count; k++) {
    const i = from + k, c = crates[i], g = ghosts[k], land = slotPos(i), at = 2.7 + k * 0.12;
    tl.call(() => { gsap.killTweensOf(c.scale); c.position.set(land.x, 12.5, land.z); c.scale.setScalar(1); }, null, at);
    tl.to(c.position, { y: land.y, duration: D(0.9), ease: 'bounce.out' }, at);
    tl.to(g.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: D(0.2) }, at + 0.7);
  }
  tl.call(() => { P.visible = false; });
  return tl;
}
function unloadTruck(truck, from, count) {
  // crates hop from the truck into the red gaps
  const tl = gsap.timeline();
  for (let k = 0; k < count; k++) {
    const i = from + k, c = crates[i], g = ghosts[k], land = slotPos(i), at = k * 0.15;
    tl.call(() => { gsap.killTweensOf(c.scale); const s = float.worldToLocal(wp(truck)); c.position.set(s.x, 1.2, s.z); c.scale.setScalar(1); }, null, at);
    tl.to(c.position, { x: land.x, z: land.z, duration: D(0.7), ease: 'power1.inOut' }, at);
    tl.to(c.position, { y: 3.2, duration: D(0.35), ease: 'power1.out', yoyo: true, repeat: 1 }, at);
    tl.set(c.position, { y: land.y }, at + 0.71);
    tl.to(g.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: D(0.2) }, at + 0.6);
  }
  return tl;
}
function roof(open, animate = true) {
  const r = W.WarehouseRoof;
  gsap.killTweensOf([r.position, r.rotation, r.scale]);
  if (open) {
    const tl = gsap.timeline();
    tl.to(r.position, { y: W.roofY + 7, duration: animate ? D(1.2) : 0, ease: 'power2.in' });
    tl.to(r.rotation, { x: -0.5, duration: animate ? D(1.2) : 0, ease: 'power2.in' }, 0);
    tl.to(r.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: animate ? D(0.4) : 0 }, animate ? 0.9 : 0);
    return tl;
  }
  r.position.y = W.roofY; r.rotation.x = 0; r.scale.setScalar(1);
}

// ------------------------------------------------------------------ HTML layer anchored to the world
const anchored = new Set();
function anchor(el, posFn, dy = 0, yp = -100) { const a = { el, posFn, dy }; anchored.add(a); $('#anchors').appendChild(el); gsap.set(el, { xPercent: -50, yPercent: yp }); return a; }
function unanchor(a) { if (!a) return; anchored.delete(a); a.el.remove(); }
const V = new THREE.Vector3();
function placeAnchors() {
  const w = xp.clientWidth, h = xp.clientHeight;
  for (const a of anchored) {
    V.copy(a.posFn()).project(camera);
    const behind = V.z > 1;
    a.el.style.left = `${((V.x + 1) / 2) * w}px`;
    a.el.style.top = `${((1 - V.y) / 2) * h + a.dy}px`;
    a.el.style.visibility = behind ? 'hidden' : '';
  }
}
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function card(cls, html, parent = $('#panels')) {
  const c = el('div', `card ${cls}`, html); parent.appendChild(c);
  gsap.from(c, { y: 18, opacity: 0, filter: 'blur(6px)', duration: D(0.5), ease: 'power3.out' });
  return c;
}
function dropCard(c) { if (!c) return; gsap.to(c, { y: 10, opacity: 0, duration: D(0.25), onComplete: () => c.remove() }); }
function clearUI() {
  $('#panels').innerHTML = ''; $('#anchors').innerHTML = ''; anchored.clear();
  prompt(''); beacon.visible = false;
  document.querySelectorAll('.title-kin').forEach(e => e.remove());
}
function prompt(text) { const p = $('#prompt'); p.textContent = text; p.classList.toggle('on', !!text); }
function badge(at, cls, text) { const b = el('div', `badge3d ${cls}`, text); const a = anchor(b, anchorPos[at], -6); gsap.from(b, { scale: 0.6, opacity: 0, duration: D(0.4), ease: 'back.out(2)' }); return a; }
function tagsOn() {
  const list = [['factory', 'Suppliers'], ['warehouse', 'Northshore warehouse'], ['shop', 'Harbour Bikes · key dealer'], ['halifax', 'Halifax warehouse']];
  return list.map(([at, t], i) => { const e = el('div', 'tag', t); const a = anchor(e, anchorPos[at], -4); gsap.to(e, { opacity: 1, y: -6, duration: D(0.5), delay: i * 0.35, ease: 'power3.out' }); return a; });
}

// ------------------------------------------------------------------ narration + captions
let CAPS = {};
const AUDIO = {};
let speaking = null; // { id, audio }
function prepAudio() {
  for (const id of Object.keys(CAPS)) { const a = new Audio(`audio/${id}.mp3`); a.preload = 'auto'; AUDIO[id] = a; }
}
function showCaption(id) {
  const box = $('#captions'); box.innerHTML = '';
  if (!id) return;
  const line = el('span', 'line');
  CAPS[id].words.forEach((w, i) => { const s = el('span', 'w', w.w); s.dataset.s = w.s; line.appendChild(s); if (i < CAPS[id].words.length - 1) line.appendChild(document.createTextNode(' ')); });
  box.appendChild(line);
}
function tickCaption() {
  if (!speaking) return;
  const t = speaking.audio.currentTime;
  $('#captions').querySelectorAll('.w').forEach(w => w.classList.toggle('on', +w.dataset.s <= t + 0.03));
}

// ------------------------------------------------------------------ run control: chapters, pause, jump
class Cancel extends Error {}
let run = 0, paused = false, started = false, muted = false;
const pending = new Set();
function guard(t) { if (t !== run) throw new Cancel(); }
function cancellable(t, exec) {
  guard(t);
  return new Promise((res, rej) => {
    const p = { rej }; pending.add(p);
    exec(v => { pending.delete(p); t === run ? res(v) : rej(new Cancel()); }, rej);
  });
}
function cancelAll() {
  for (const p of pending) p.rej(new Cancel());
  pending.clear();
  if (speaking) { speaking.audio.pause(); speaking = null; }
  showCaption(null);
}
function say(id, t) {
  return cancellable(t, done => {
    const a = AUDIO[id]; a.currentTime = 0; a.muted = muted; a.playbackRate = FAST;
    speaking = { id, audio: a }; showCaption(id);
    a.onended = () => { if (speaking?.audio === a) speaking = null; setTimeout(() => { if (!speaking) showCaption(null); }, 250); done(); };
    const go = () => a.play().catch(() => setTimeout(done, CAPS[id].dur * 1000));
    paused ? (a.pendingPlay = go) : go();
  });
}
function wait(s, t) { return cancellable(t, done => gsap.delayedCall(D(s) || 0.001, done)); }
function play(tl, t) { return cancellable(t, done => (tl.totalProgress() >= 1 ? done() : tl.eventCallback('onComplete', done))); }
function clickOn(elm, t) { return cancellable(t, done => elm.addEventListener('click', e => done(e), { once: true })); }
function nextEvent(target, type, t) { return cancellable(t, done => target.addEventListener(type, e => done(e), { once: true })); }

function setPaused(v) {
  if (!started) return;
  paused = v;
  xp.classList.toggle('paused', v);
  $('#btnPlay').setAttribute('aria-label', v ? 'Play' : 'Pause');
  $('#pausedBadge').hidden = !v;
  if (v) { gsap.globalTimeline.pause(); speaking?.audio.pause(); }
  else {
    gsap.globalTimeline.resume();
    if (speaking) { const a = speaking.audio; if (a.pendingPlay) { const f = a.pendingPlay; a.pendingPlay = null; f(); } else a.play().catch(() => {}); }
  }
}

// ------------------------------------------------------------------ interactions
let pickTruck = null; // resolver when the truck is clickable in 3D
function hotspot(at, label, quiet = false) {
  const b = el('button', `hotspot${quiet ? ' quiet' : ''}`, label ? `<span>${label}</span>` : '');
  b.type = 'button'; b.setAttribute('aria-label', label || 'Flagged shipment');
  const a = anchor(b, anchorPos[at], 0, -50); b.style.pointerEvents = 'auto';
  return a;
}
async function findAlert(t, { quiet }) {
  beacon.visible = true;
  const hs = hotspot('truck', quiet ? '' : 'Late shipment', quiet);
  if (!quiet) prompt('Select the flagged truck');
  hs.el.focus({ preventScroll: true });
  await cancellable(t, done => { pickTruck = done; hs.el.addEventListener('click', done, { once: true }); });
  pickTruck = null; unanchor(hs); prompt(''); beacon.visible = false;
  sfx('ok');
  const c = CASE;
  return card('alert', `<div class="kicker">⚠ Alert · high priority</div><h3>Late shipment: ${c.item}</h3><p>${c.supplier} moved its delivery of ${c.name} ${c.delay}.</p>`);
}

function projectionCard() {
  const c = CASE, max = Math.max(...c.stock.map(Math.abs));
  const bars = c.stock.map((v, i) => `<div class="pb${v < 0 ? ' neg' : ''}" data-w="${i + 1}"><i style="height:${Math.abs(v) / max * (v < 0 ? 34 : 66)}%"></i><b style="${v < 0 ? 'top:auto;bottom:-2px' : ''}"></b></div>`).join('');
  const html = `<div class="kicker">PlanDesk · projected inventory</div><h3>${c.item} ${c.name}</h3>
    <div class="bars" aria-hidden="true">${bars}</div><div class="weeks" aria-hidden="true">${c.stock.map((_, i) => `<span>Wk ${i + 1}</span>`).join('')}</div>
    <label class="sr" for="wk">Week</label><input class="slider" id="wk" type="range" min="1" max="6" step="1" value="1">
    <div class="readout"><span>Week <b id="wkN">1</b>: <span class="val" id="wkV"></span></span><button type="button" class="act" id="wkMark">This is the week</button></div>`;
  const cd = card('proj', html);
  const upd = () => {
    const w = +cd.querySelector('#wk').value, v = c.stock[w - 1];
    cd.querySelector('#wkN').textContent = w;
    const val = cd.querySelector('#wkV'); val.textContent = `${v < 0 ? '−' : ''}${Math.abs(v)} ${c.unit}${v < 0 ? ' ⚠ short' : ' in stock'}`; val.classList.toggle('neg', v < 0);
    cd.querySelectorAll('.pb').forEach(b => b.classList.toggle('cur', +b.dataset.w === w));
    showStock(v);
  };
  cd.querySelector('#wk').addEventListener('input', upd); upd();
  return cd;
}
async function findWeek(t, { test }) {
  const cd = projectionCard();
  if (!test) prompt('Drag through the weeks, then mark the first week you run short');
  cd.querySelector('#wk').focus({ preventScroll: true });
  for (;;) {
    await clickOn(cd.querySelector('#wkMark'), t);
    const w = +cd.querySelector('#wk').value;
    if (w === CASE.shortWeek) break;
    test ? score.testWeek++ : score.weekMistakes++;
    sfx('no');
    gsap.fromTo(cd, { x: -8 }, { x: 0, duration: D(0.4), ease: 'elastic.out(1,0.3)' });
    await say(test ? 'FT_WEEK' : 'F_WEEK', t);
  }
  prompt(''); sfx('ok');
  cd.querySelector('#wkMark').disabled = true; cd.querySelector('#wk').disabled = true;
  ghosts.forEach(g => g.scale.x > 0.5 && gsap.fromTo(g.scale, { x: 1.2, y: 1.2, z: 1.2 }, { x: 1, y: 1, z: 1, duration: D(0.6), ease: 'elastic.out(1,0.4)' }));
  return cd;
}

function policyCard() {
  return card('policy dark', `<div class="kicker">Policy</div><p><b>Key dealer orders ship complete and on time.</b> You can approve up to <b>$2,500</b>. Choose the <b>lowest-cost option</b> that meets the policy.</p>`);
}
function scenarioCards(tried) {
  const narrow = xp.clientWidth < 760;
  const dock = narrow ? el('div', 'scen-dock') : null;
  if (dock) $('#panels').appendChild(dock);
  const list = CASE.options.map((o, i) => {
    const b = el('button', `card scen${tried.has(o.key) ? ' tried' : ''}`, `<div class="kicker">${tried.has(o.key) ? '✗ Tried' : `Option ${i + 1}`}</div><h3><span class="ico" aria-hidden="true">${o.icon}</span> ${o.title}</h3><div class="cost">${o.cost}</div><p>${o.note}</p>`);
    b.type = 'button'; b.dataset.key = o.key;
    if (narrow) { dock.appendChild(b); gsap.from(b, { y: 16, opacity: 0, duration: D(0.4), delay: i * 0.08 }); return { b }; }
    const a = anchor(b, anchorPos[o.at], -8, -110);
    $('#anchors').style.pointerEvents = 'none'; b.style.pointerEvents = 'auto';
    gsap.from(b, { scale: 0.85, opacity: 0, duration: D(0.45), delay: i * 0.12, ease: 'back.out(1.8)' });
    return { b, a };
  });
  return { list, remove() { list.forEach(({ b, a }) => (a ? unanchor(a) : b.remove())); dock?.remove(); } };
}
async function choose(t, { test, pol }) {
  const tried = new Set();
  pol = pol || policyCard();
  for (;;) {
    const sc = scenarioCards(tried);
    if (!test) prompt(tried.size ? 'Try another option' : 'Choose a scenario');
    sc.list[0].b.focus({ preventScroll: true });
    const key = await cancellable(t, done => sc.list.forEach(({ b }) => b.addEventListener('click', () => done(b.dataset.key), { once: true })));
    prompt(''); sc.remove();
    const o = CASE.options.find(x => x.key === key);
    const [simTl, badges] = simulate(o);
    await Promise.all([play(simTl, t), say(o.fb, t)]);
    if (o.ok) { sfx('ok'); await wait(0.6, t); badges.forEach(unanchor); dropCard(pol); return; }
    sfx('no');
    test ? score.testChoice++ : score.choiceMistakes++;
    tried.add(key);
    await wait(0.4, t);
    badges.forEach(unanchor);
    preOrder(); resetTrucks();
  }
}
function preOrder() { setShelves(CASE.pre / UNIT, CASE.short / UNIT, true); }

function simulate(o) {
  const tl = gsap.timeline(), badges = [];
  const late = () => badges.push(badge('shop', 'bad', '✗ One week late'));
  if (o.key === 'wait') {
    tl.add(shot('overview', 1.6), 0);
    tl.call(() => badges.push(badge('factory', 'warn', '⏳ +1 week')), null, 0.4);
    tl.add(drive(W.Truck, W.routeMain, 2.2), 0.6);
    tl.call(late, null, 3.2);
  } else if (o.key === 'split') {
    tl.add(shot('options', 1.2), 0);
    tl.add(flyCrates(CASE.pre / UNIT), 0.6);
    tl.call(() => badges.push(badge('shop', 'warn', `⚠ ${CASE.pre} of ${CASE.qty}: incomplete`)), null, 2.6);
  } else if (o.key === 'air') {
    tl.add(shot('options', 1.0), 0);
    tl.add(airDrop(CASE.pre / UNIT, CASE.short / UNIT), 0.3);
    tl.add(flyCrates(CASE.qty / UNIT), 4.8);
    if (o.ok) tl.call(() => badges.push(badge('shop', 'ok', '✓ Complete, on time')), null, 6.6);
    else {
      tl.call(() => badges.push(badge('shop', 'ok', '✓ On time')), null, 6.6);
      tl.call(() => badges.push(badge(o.at, 'bad', '✗ $3,100: over your limit')), null, 7.0);
    }
  } else if (o.key === 'transfer') {
    tl.add(shot('overview', 1.2), 0);
    tl.add(drive(W.Truck2, W.routeHalifax, 4.2), 0.4);
    tl.add(unloadTruck(W.Truck2, CASE.pre / UNIT, CASE.short / UNIT), '>');
    tl.add(flyCrates(CASE.qty / UNIT), '>0.2');
    tl.call(() => badges.push(badge('shop', 'ok', '✓ Complete, on time')), null, '>0.1');
  }
  return [tl, badges];
}

// tiny UI sounds (WebAudio, no files)
let actx;
function sfx(kind) {
  if (muted) return;
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'ok' ? 660 : 220, t);
    if (kind === 'ok') o.frequency.exponentialRampToValueAtTime(990, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.3);
  } catch { /* sound is optional */ }
}

// ------------------------------------------------------------------ chapters
function kineticTitle(text, sub) {
  const t = el('div', 'title-kin', text.split('').map(ch => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`).join('') + `<small>${sub}</small>`);
  xp.appendChild(t);
  gsap.from(t.querySelectorAll('span'), { y: 60, opacity: 0, rotate: 8, duration: D(0.8), stagger: 0.04, ease: 'power4.out' });
  gsap.from(t.querySelector('small'), { opacity: 0, y: 10, duration: D(0.6), delay: 0.6 });
  return t;
}
function baseState(caseKey) {
  CASE = CASES[caseKey];
  resetTrucks(); W.Plane.visible = false;
  crates.forEach((c, i) => c.position.copy(slotPos(i)));
}

const CH = [
  { id: 'welcome', title: 'Welcome', est: 18,
    setup() { baseState('practice'); roof(false); showStock(CASE.stock[0], false); cut('intro'); },
    async run(t) {
      const title = kineticTitle('Late shipment', 'An interactive PlanDesk simulation');
      await play(shot('overview', 6.5, 'power2.inOut'), t);
      gsap.to(title, { opacity: 0, y: -20, duration: D(0.6), onComplete: () => title.remove() });
      const tags = tagsOn();
      await say('L01', t);
      await say('L02', t);
      tags.forEach(a => gsap.to(a.el, { opacity: 0, duration: D(0.3), onComplete: () => unanchor(a) }));
    } },
  { id: 'alert', title: 'The alert', est: 16,
    setup() { baseState('practice'); roof(false); showStock(CASE.stock[0], false); cut('overview'); },
    async run(t) {
      shot('factory', 2.4);
      await say('L03', t);
      await say('L04', t);
      await findAlert(t, { quiet: false });
      await say('G01', t);
    } },
  { id: 'shortfall', title: 'When stock runs out', est: 27,
    setup() { baseState('practice'); roof(false); showStock(CASE.stock[0], false); cut('factory'); card('alert', `<div class="kicker">⚠ Alert · high priority</div><h3>Late shipment: ${CASE.item}</h3><p>${CASE.supplier} moved its delivery of ${CASE.name} ${CASE.delay}.</p>`); },
    async run(t) {
      shot('warehouse', 2.6);
      await wait(0.8, t);
      roof(true);
      await say('L05', t);
      await say('L06', t);
      const cd = await findWeek(t, { test: false });
      await say('L07', t);
      dropCard(cd);
      document.querySelectorAll('.card.alert').forEach(dropCard);
    } },
  { id: 'impact', title: 'Who is affected', est: 10,
    setup() { baseState('practice'); roof(true, false); showStock(CASE.stock[2], false); cut('warehouse'); },
    async run(t) {
      shot('shop', 2.4);
      await wait(0.9, t);
      const b = badge('shop', 'warn', `${CASE.customer} · ${CASE.qty} ${CASE.unit} due week ${CASE.shortWeek} · 50 short`);
      await say('L08', t);
      await wait(0.4, t);
      unanchor(b);
    } },
  { id: 'options', title: 'Your options', est: 42,
    setup() { baseState('practice'); roof(true, false); showStock(CASE.stock[2], false); cut('shop'); },
    async run(t) {
      shot('options', 2.6);
      preOrder();
      await say('L09', t);
      const pol = policyCard();
      await say('L10', t);
      await say('L11', t);
      await choose(t, { test: false, pol });
    } },
  { id: 'test', title: 'Your turn', est: 52,
    setup() { baseState('test'); roof(false); showStock(CASE.stock[0], false); cut('overview'); },
    async run(t) {
      baseState('test');
      roof(false); showStock(CASE.stock[0]);
      shot('overview', 2.4);
      await say('L12', t);
      await say('L13', t);
      shot('factory', 2);
      const al = await findAlert(t, { quiet: true });
      shot('warehouse', 2.4); await wait(0.6, t); roof(true);
      const cd = await findWeek(t, { test: true });
      await wait(0.6, t); dropCard(cd); dropCard(al);
      shot('options', 2.4); preOrder();
      await wait(1.2, t);
      await choose(t, { test: true });
    } },
  { id: 'wrap', title: 'Wrap-up', est: 15,
    setup() { baseState('practice'); roof(false); showStock(CASE.stock[0], false); cut('options'); },
    async run(t) {
      roof(false, false); showStock(CASES.practice.stock[3]);
      shot('overview', 3);
      await say('L14', t);
      await say('L15', t);
      await wait(0.5, t);
      showResults();
    } },
];

// ------------------------------------------------------------------ chapter bar, clock
let current = 0, chClock = 0, elapsed = 0;
const chapBtns = [];
function buildBar() {
  const box = $('#chapters');
  CH.forEach((c, i) => {
    const b = el('button', 'chap', `<i><b></b></i><span>${i + 1}. ${c.title}</span>`);
    b.type = 'button'; b.setAttribute('role', 'listitem'); b.setAttribute('aria-label', `Chapter ${i + 1}: ${c.title}`);
    b.style.setProperty('--w', c.est);
    b.addEventListener('click', () => { if (started) goChapter(i); });
    box.appendChild(b); chapBtns.push(b);
  });
}
function paintBar() {
  chapBtns.forEach((b, i) => {
    b.classList.toggle('done', i < current);
    b.querySelector('b').style.width = i === current ? `${Math.min(100, (chClock / CH[i].est) * 100)}%` : i < current ? '100%' : '0%';
    b.setAttribute('aria-current', i === current ? 'step' : 'false');
  });
  const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
  $('#time').textContent = `${m}:${String(s).padStart(2, '0')}`;
}
function setChapterName(i) { const n = $('#chapterName'); n.textContent = `${i + 1} · ${CH[i].title}`; n.classList.add('on'); }

async function goChapter(i) {
  run++; const t = run;
  cancelAll(); gsap.globalTimeline.clear(); clearUI();
  if (paused) setPaused(false);
  $('#results').hidden = true;
  CH[i].setup();
  try {
    for (let k = i; k < CH.length; k++) {
      current = k; chClock = 0; setChapterName(k); paintBar();
      await CH[k].run(t);
      guard(t);
    }
  } catch (e) { if (!(e instanceof Cancel)) console.error(e); }
}

function showResults() {
  const s = score, practice = s.weekMistakes + s.choiceMistakes;
  $('#scores').innerHTML = [
    `<li>Practice: ${practice === 0 ? 'no mistakes' : `${practice} ${practice === 1 ? 'mistake' : 'mistakes'}, all put right`}</li>`,
    `<li>Test, finding the week: ${s.testWeek === 0 ? 'first time' : `after ${s.testWeek} wrong ${s.testWeek === 1 ? 'try' : 'tries'}`}</li>`,
    `<li>Test, choosing the fix: ${s.testChoice === 0 ? 'first time' : `after ${s.testChoice} wrong ${s.testChoice === 1 ? 'try' : 'tries'}`}</li>`,
  ].join('');
  $('#resultsTitle').textContent = s.testWeek + s.testChoice === 0 ? 'Nicely handled.' : 'Done, and you got there.';
  current = CH.length; paintBar();
  const r = $('#results'); r.hidden = false; gsap.from(r.querySelector('.cover-card'), { y: 20, opacity: 0, duration: D(0.6) });
  $('#btnReplay').focus();
}

// ------------------------------------------------------------------ input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', e => {
  if (!pickTruck) { renderer.domElement.style.cursor = ''; return; }
  ndc.set((e.offsetX / renderer.domElement.clientWidth) * 2 - 1, -(e.offsetY / renderer.domElement.clientHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  renderer.domElement.style.cursor = ray.intersectObject(W.Truck, true).length ? 'pointer' : '';
});
stageEl.style.pointerEvents = 'auto';
renderer.domElement.addEventListener('click', e => {
  if (!pickTruck) return;
  ndc.set((e.offsetX / renderer.domElement.clientWidth) * 2 - 1, -(e.offsetY / renderer.domElement.clientHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(W.Truck, true).length) pickTruck();
});
$('#btnPlay').addEventListener('click', () => setPaused(!paused));
$('#btnCC').addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); xp.classList.toggle('nocc', !on); });
$('#btnMute').addEventListener('click', e => { muted = !muted; e.currentTarget.setAttribute('aria-pressed', muted); e.currentTarget.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); if (speaking) speaking.audio.muted = muted; });
$('#btnFull').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : xp.requestFullscreen?.()));
$('#btnTranscript').addEventListener('click', e => { const t = $('#transcript'); t.hidden = !t.hidden; e.currentTarget.setAttribute('aria-expanded', !t.hidden); });
$('#btnReplay').addEventListener('click', () => { Object.keys(score).forEach(k => (score[k] = 0)); elapsed = 0; goChapter(0); });
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || !started) return;
  if (e.target.closest?.('input,button,a,textarea')) return;
  e.preventDefault(); setPaused(!paused);
});

// ------------------------------------------------------------------ loop
function resize() {
  const w = xp.clientWidth, h = xp.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  if (!RM) {
    float.position.y = Math.sin(t * 0.7) * 0.12;
    if (W.Clouds) W.Clouds.rotation.y += dt * 0.02;
  }
  const drift = RM ? 0 : 1;
  camera.position.set(camBase.x + Math.sin(t * 0.31) * 0.25 * drift, camBase.y + Math.sin(t * 0.47) * 0.15 * drift, camBase.z);
  camera.lookAt(camTarget);
  if (beacon.visible) {
    beacon.position.copy(anchorPos.truck()); beacon.quaternion.copy(camera.quaternion);
    const k = 1 + ((t * 1.2) % 1) * 0.8; beacon.scale.setScalar(k); beacon.material.opacity = 1.4 - k * 0.7;
  }
  if (started && !paused) { elapsed += dt; chClock += dt; }
  tickCaption(); placeAnchors();
  if (started) paintBar();
  renderer.render(scene, camera);
  if (TEST) { gsap.ticker.tick(); setTimeout(loop, 33); } else requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ boot
(async function boot() {
  resize(); buildBar(); cut('intro');
  gsap.globalTimeline.timeScale(FAST);
  TEST ? loop() : requestAnimationFrame(loop);
  if (TEST) window.__xp = { goChapter, score, get W() { return W; }, get current() { return current; }, setPaused };
  const label = $('#startLabel');
  try {
    CAPS = await (await fetch('audio/captions.json')).json();
    prepAudio();
    const order = ['L01', 'L02', 'L03', 'L04', 'G01', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15'];
    $('#transcriptList').innerHTML = order.map(id => `<li>${CAPS[id].text}</li>`).join('') +
      `<li><i>Feedback you may hear:</i> ${['F_WEEK', 'F_WAIT', 'F_SPLIT', 'F_AIR', 'FT_WEEK', 'FT_AIR', 'FT_WAIT', 'FT_TRANSFER'].map(id => CAPS[id].text).join(' / ')}</li>`;
    await loadWorld(p => { label.textContent = `Loading the world… ${Math.round(p * 100)}%`; });
    CH[0].setup();
  } catch (e) {
    console.error(e); label.textContent = 'Could not load. Please refresh.'; return;
  }
  label.textContent = 'Start the lesson';
  const b = $('#btnStart'); b.disabled = false;
  xp.dataset.state = 'ready';
  b.addEventListener('click', () => {
    started = true; xp.dataset.state = 'playing';
    $('#start').hidden = true;
    goChapter(0);
  }, { once: true });
})();
