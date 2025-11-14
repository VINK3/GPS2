// === EVIDENCIAS FOTOGRÁFICAS ===
// Envía reporte, fotos y video al Apps Script de Google Drive

// URL de tu Apps Script publicado (reemplázalo con el tuyo)
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwoqjgTrz68p-_KFQAFh2Irfi77DP4pxSFZRiEYznLVmIcMvgRD_X35hbGuP9oZCt6o/exec";

/* ====== Estado ====== */
let fotos = [];                // dataURLs con marca de agua
let recordedVideoBlob = null;  // blob del video grabado
let mediaRecorder = null;
let videoStream = null;
let currentPosition = null;

/* ====== Inicio: cargar formulario y bind de botones ====== */
document.addEventListener("DOMContentLoaded", () => {
  cargarFormulario();
  document.getElementById("btnBuscar").onclick = buscarTitular;

  // Firma
  setupSignature();

  // Cámara
  document.getElementById("btnIniciarCamara").onclick = startCamera;
  document.getElementById("btnDetenerCamara").onclick = stopCamera;
  document.getElementById("btnTomarFoto").onclick = takePhoto;
  document.getElementById("btnVideo").onclick = toggleRecording;

  // Acciones finales
  document.getElementById("btnDescargarZIP").onclick = descargarZip;
  document.getElementById("btnSubirDrive").onclick = subirDrive;

  // Obtener posición (intento inicial, se actualizará en cada captura si es posible)
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(pos => currentPosition = pos.coords, () => { /* ignorar */ });
  }
});

/* ===================== CARGAR FORMULARIO ===================== */
async function cargarFormulario() {
  const cont = document.getElementById("inspection-form");
  cont.innerHTML = "⏳ Cargando formulario...";
  try {
    const res = await fetch("formulario.json?nocache=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const secciones = Array.isArray(data) ? data : data.secciones || [];
    cont.innerHTML = "";
    secciones.forEach(sec => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = sec.titulo || "Sección";
      fieldset.appendChild(legend);
      const campos = Array.isArray(sec.campos) ? sec.campos : [];
      campos.forEach(c => {
        const label = document.createElement("label");
        label.textContent = c.etiqueta || c.id;
        fieldset.appendChild(label);
        let input;
        if (c.tipo === "select") {
          input = document.createElement("select");
          (c.opciones || []).forEach(op => {
            const o = document.createElement("option"); o.value = op; o.textContent = op; input.appendChild(o);
          });
        } else if (c.tipo === "textarea") {
          input = document.createElement("textarea");
        } else {
          input = document.createElement("input");
          input.type = c.tipo || "text";
        }
        input.id = c.id;
        fieldset.appendChild(input);
      });
      cont.appendChild(fieldset);
    });
    console.log("Formulario cargado.");
  } catch (err) {
    cont.innerHTML = `<p style="color:#900">Error cargando formulario: ${err.message}</p>`;
    console.error(err);
  }
}

/* ===================== BUSCAR Y AUTORELLENAR ===================== */
async function buscarTitular() {
  const codigo = document.getElementById("codigo_usuario").value.trim();
  if (!codigo) return alert("Ingrese código de suministro.");
  try {
    const res = await fetch("base_titulares.json?nocache=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const base = await res.json();
    // Buscar por codigo_usuario (tolerante)
    const usuario = base.find(u => String(u.codigo_usuario).trim().toLowerCase() === codigo.trim().toLowerCase());
    if (!usuario) return alert("No se encontró el suministro.");
    // Rellenar por id coincidiente o por etiqueta parcial
    const campos = Array.from(document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea"));
    Object.entries(usuario).forEach(([k,v]) => {
      const exact = document.getElementById(k);
      if (exact) { exact.value = v; }
      else {
        // buscar por coincidencia parcial en id o label
        const parcial = campos.find(el => el.id && el.id.toLowerCase().includes(k.toLowerCase()) ||
          (el.previousElementSibling && el.previousElementSibling.textContent.toLowerCase().includes(k.toLowerCase())));
        if (parcial) parcial.value = v;
      }
    });
    // actualizar posición GPS y UTM si es posible
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(p => { currentPosition = p.coords; fillUTM(p.coords); }, () => {});
    }
    setStatus(`Datos cargados: ${usuario.nombres_apellidos || codigo}`);
  } catch (err) {
    alert("Error leyendo base de titulares: " + err.message);
  }
}

/* ===================== UTM ===================== */
function fillUTM(coords) {
  if (!coords) return;
  const utm = convertirLatLonUTM(coords.latitude, coords.longitude, 18);
  const eEl = document.getElementById("utm_este"); if (eEl) eEl.value = utm.este.toFixed(2);
  const nEl = document.getElementById("utm_norte"); if (nEl) nEl.value = utm.norte.toFixed(2);
  const zEl = document.getElementById("utm_zona"); if (zEl) zEl.value = 18;
}
function convertirLatLonUTM(lat, lon, zona) {
  const a = 6378137.0, f = 1/298.257223563;
  const e = Math.sqrt(f*(2-f)), k0 = 0.9996;
  const λ0 = ((zona-1)*6 - 180 + 3) * (Math.PI/180);
  const φ = lat*(Math.PI/180), λ = lon*(Math.PI/180);
  const N = a / Math.sqrt(1 - Math.pow(e*Math.sin(φ),2));
  const T = Math.tan(φ)*Math.tan(φ);
  const C = (Math.pow(e,2)/(1-Math.pow(e,2)))*Math.pow(Math.cos(φ),2);
  const A = Math.cos(φ)*(λ-λ0);
  const M = a * ( (1 - Math.pow(e,2)/4 - 3*Math.pow(e,4)/64 - 5*Math.pow(e,6)/256)*φ
    - (3*Math.pow(e,2)/8 + 3*Math.pow(e,4)/32 + 45*Math.pow(e,6)/1024)*Math.sin(2*φ)
    + (15*Math.pow(e,4)/256 + 45*Math.pow(e,6)/1024)*Math.sin(4*φ)
    - (35*Math.pow(e,6)/3072)*Math.sin(6*φ) );
  const Este = 500000 + k0 * N * (A + (1 - T + C)*Math.pow(A,3)/6 + (5 - 18*T + T*T + 72*C - 58*(Math.pow(e,2)/(1-Math.pow(e,2))))*Math.pow(A,5)/120 );
  const Norte = k0 * ( M + N * Math.tan(φ) * ( Math.pow(A,2)/2 + (5 - T + 9*C + 4*C*C)*Math.pow(A,4)/24 + (61 - 58*T + T*T + 600*C - 330*(Math.pow(e,2)/(1-Math.pow(e,2))))*Math.pow(A,6)/720 ) );
  return { este: Este, norte: lat < 0 ? Norte + 10000000 : Norte };
}

/* ===================== FIRMA (setup) ===================== */
function setupSignature() {
  const canvas = document.getElementById("signature");
  const ctx = canvas.getContext("2d");
  let drawing = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function start(e){ e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e){ if(!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x,p.y); ctx.strokeStyle="#000"; ctx.lineWidth=2; ctx.lineCap="round"; ctx.stroke(); }
  function end(e){ if(!drawing) return; drawing=false; ctx.closePath(); }

  canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); canvas.addEventListener("mouseup", end); canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive:false }); canvas.addEventListener("touchmove", move, { passive:false }); canvas.addEventListener("touchend", end);

  document.getElementById("btnBorrarFirma").onclick = () => { ctx.clearRect(0,0,canvas.width,canvas.height); setStatus("Firma borrada"); };
}

/* ===================== CAMARA (start/stop/take) ===================== */
async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: true });
    const video = document.getElementById("video");
    video.srcObject = videoStream;
    document.getElementById("btnTomarFoto").disabled = false;
    document.getElementById("btnDetenerCamara").disabled = false;
    document.getElementById("btnVideo").disabled = false;
    setStatus("Cámara activada");
  } catch (err) {
    alert("No se pudo activar la cámara: " + err.message);
  }
}
function stopCamera() {
  videoStream?.getTracks().forEach(t => t.stop());
  document.getElementById("video").srcObject = null;
  document.getElementById("btnTomarFoto").disabled = true;
  document.getElementById("btnDetenerCamara").disabled = true;
  document.getElementById("btnVideo").disabled = true;
  setStatus("Cámara detenida");
}
function takePhoto() {
  if (!videoStream) return alert("Activa la cámara primero.");
  const video = document.getElementById("video");
  const canvas = document.getElementById("photoCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // watermark: fecha/hora y coords (si existen)
  const now = new Date();
  const fecha = now.toLocaleString();
  const coordsText = currentPosition ? `${currentPosition.latitude.toFixed(6)}, ${currentPosition.longitude.toFixed(6)}` : "Ubicación no disponible";
  // estilizar watermark
  const padding = 12;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  const barHeight = 50;
  ctx.fillRect(10, canvas.height - barHeight - 10, 420, barHeight);
  ctx.fillStyle = "white";
  ctx.font = `${Math.max(14, Math.floor(canvas.width/80))}px Arial`;
  ctx.fillText(fecha, 18, canvas.height - 30);
  ctx.fillText(coordsText, 18, canvas.height - 10);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  fotos.push(dataUrl);

  // mostrar miniatura
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "Foto";
  img.width = 110;
  document.getElementById("preview").appendChild(img);

  setStatus("Foto tomada");
}

/* ===================== VIDEO (record) ===================== */
function toggleRecording() {
  const btn = document.getElementById("btnVideo");
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    if (!videoStream) return alert("Activa la cámara antes de grabar.");
    videoChunks = [];
    mediaRecorder = new MediaRecorder(videoStream, { mimeType: "video/webm; codecs=vp8,opus" });
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) videoChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      recordedVideoBlob = new Blob(videoChunks, { type: "video/webm" });
      const url = URL.createObjectURL(recordedVideoBlob);
      const v = document.createElement("video");
      v.src = url; v.controls = true; v.width = 110;
      document.getElementById("preview").appendChild(v);
      setStatus("Video grabado");
    };
    mediaRecorder.start();
    btn.textContent = "⏹ Detener grabación";
    setStatus("Grabando video...");
  } else {
    mediaRecorder.stop();
    btn.textContent = "🎥 Grabar video";
  }
}

/* ===================== ZIP (estructura carpeta codigo/) ===================== */
async function descargarZip() {
  const codigo = (document.getElementById("codigo_usuario").value || "SIN_CODIGO").trim();
  if (!fotos.length && !recordedVideoBlob) return alert("No hay fotos ni video para empaquetar.");
  // generar PDF con formulario, firma y luego fotos
  const pdfBlob = await generarPdfBlob(codigo);
  const zip = new JSZip();
  const carpeta = zip.folder(codigo);
  carpeta.file(`${codigo}_reporte.pdf`, pdfBlob);

  // fotos
  fotos.forEach((duri, i) => {
    const base64 = duri.split(",")[1];
    carpeta.file(`${codigo}_${i+1}.jpg`, base64, { base64: true });
  });
  // video
  if (recordedVideoBlob) {
    carpeta.file(`${codigo}_video.webm`, recordedVideoBlob);
  }
  const blobZip = await zip.generateAsync({ type: "blob" });
  saveAs(blobZip, `${codigo}.zip`);
  setStatus("ZIP descargado");
}

/* ===================== GENERAR PDF (blob) ===================== */
async function generarPdfBlob(codigo) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 40;
  doc.setFontSize(14);
  doc.text("FORMATO DE INSPECCIÓN SFV", 40, y);
  y += 24;
  doc.setFontSize(10);

  // incluir todos los campos del formulario
  const fields = Array.from(document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea"));
  fields.forEach(el => {
    const label = el.previousElementSibling ? el.previousElementSibling.textContent : el.id;
    const text = `${label}: ${String(el.value || "")}`;
    const lines = doc.splitTextToSize(text, 500);
    doc.text(lines, 40, y);
    y += (lines.length * 12) + 6;
    if (y > 720) { doc.addPage(); y = 40; }
  });

  // Firma
  const sigCanvas = document.getElementById("signature");
  const sigData = sigCanvas.toDataURL("image/png");
  if (sigData && sigData.length > 100) {
    if (y > 620) { doc.addPage(); y = 40; }
    doc.text("Firma:", 40, y);
    doc.addImage(sigData, "PNG", 40, y+8, 200, 80);
    y += 100;
  }

  // fotos anexas: una foto por página
  for (let i=0; i<fotos.length; i++) {
    doc.addPage();
    doc.setFontSize(12);
    doc.text(`Foto ${i+1}`, 40, 40);
    try {
      doc.addImage(fotos[i], "JPEG", 40, 60, 500, 360);
    } catch(e){
      console.warn("No se pudo añadir la imagen al PDF:", e);
    }
  }

  // video no se incrusta (se guarda como archivo aparte)
  return new Promise(resolve => {
    const blob = doc.output("blob");
    resolve(blob);
  });
}

/* ===================== SUBIR ZIP A DRIVE (Apps Script) ===================== */
async function subirDrive() {
  const unidad = document.getElementById("unidad_negocio").value;
  const codigo = (document.getElementById("codigo_usuario").value || "").trim();
  if (!unidad || !codigo) return alert("Seleccione unidad y código.");

  setStatus("Preparando ZIP...");
  // crear zip igual que descargarZip pero sin descargar
  const pdfBlob = await generarPdfBlob(codigo);
  const zip = new JSZip();
  const carpeta = zip.folder(codigo);
  carpeta.file(`${codigo}_reporte.pdf`, pdfBlob);
  fotos.forEach((duri, i) => carpeta.file(`${codigo}_${i+1}.jpg`, duri.split(",")[1], { base64: true }));
  if (recordedVideoBlob) carpeta.file(`${codigo}_video.webm`, recordedVideoBlob);

  const zipBlob = await zip.generateAsync({ type: "blob" });

  // enviar al Apps Script como base64
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64 = reader.result.split(",")[1];
    const body = new URLSearchParams({
      unidad,
      suministro: codigo,
      nombre: `${codigo}.zip`,
      tipo: "application/zip",
      archivo: base64
    });
    setStatus("Subiendo a Drive...");
    try {
      const res = await fetch(WEBAPP_URL, { method: "POST", body });
      const txt = await res.text();
      if (txt && txt.toLowerCase().includes("ok")) {
        setStatus("✅ Subido a Drive");
        alert("✅ Archivo guardado en Google Drive");
      } else {
        setStatus("❌ Error subida");
        alert("Error subiendo: " + txt);
      }
    } catch (err) {
      setStatus("❌ Error conexión");
      alert("Error subiendo a Drive: " + err.message);
    }
  };
  reader.readAsDataURL(zipBlob);
}

/* ===================== UTIL ===================== */
function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
}
