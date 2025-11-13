// === EVIDENCIAS FOTOGRÁFICAS ===
// Envía reporte, fotos y video al Apps Script de Google Drive

// URL de tu Apps Script publicado (reemplázalo con el tuyo)
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwoqjgTrz68p-_KFQAFh2Irfi77DP4pxSFZRiEYznLVmIcMvgRD_X35hbGuP9oZCt6o/exec";

let fotos = [];
let videos = [];
let mediaRecorder;
let videoChunks = [];

// === CARGAR FORMULARIO ===
async function cargarFormulario() {
  const cont = document.getElementById("inspection-form");
  cont.innerHTML = "⏳ Cargando formulario...";
  try {
    const res = await fetch("formulario.json?nocache=" + Date.now());
    const data = await res.json();
    cont.innerHTML = "";
    data.forEach(sec => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = sec.titulo;
      fieldset.appendChild(legend);

      sec.campos.forEach(c => {
        const label = document.createElement("label");
        label.textContent = c.etiqueta;
        fieldset.appendChild(label);

        let input;
        if (c.tipo === "select") {
          input = document.createElement("select");
          c.opciones.forEach(op => {
            const o = document.createElement("option");
            o.textContent = op;
            input.appendChild(o);
          });
        } else if (c.tipo === "textarea") input = document.createElement("textarea");
        else {
          input = document.createElement("input");
          input.type = c.tipo;
        }
        input.id = c.id;
        input.required = true;
        fieldset.appendChild(input);
      });
      cont.appendChild(fieldset);
    });
  } catch (err) {
    cont.innerHTML = "❌ Error al cargar formulario: " + err.message;
  }
}

// === BUSCAR TITULAR ===
async function buscarTitular() {
  const codigo = document.getElementById("codigo_usuario").value.trim();
  if (!codigo) return alert("Ingrese un código de suministro.");
  try {
    const res = await fetch("base_titulares.json?nocache=" + Date.now());
    const data = await res.json();
    const titular = data.find(u => u.codigo_usuario === codigo);
    if (!titular) return alert("No se encontró el suministro.");

    Object.entries(titular).forEach(([k, v]) => {
      const el = document.getElementById(k);
      if (el) el.value = v;
    });

    obtenerUbicacion();
  } catch (e) {
    alert("Error al cargar base: " + e.message);
  }
}

// === GEOLOCALIZACIÓN ===
function obtenerUbicacion() {
  if (!navigator.geolocation) return alert("Geolocalización no compatible.");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    document.getElementById("utm_este").value = latitude.toFixed(6);
    document.getElementById("utm_norte").value = longitude.toFixed(6);
  });
}

// === CÁMARA ===
let stream;
document.getElementById("btnIniciarCamara").onclick = async () => {
  const video = document.getElementById("video");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
    video.srcObject = stream;
    document.getElementById("btnTomarFoto").disabled = false;
    document.getElementById("btnGrabarVideo").disabled = false;
    document.getElementById("btnDetenerCamara").disabled = false;
  } catch {
    alert("Error al activar cámara.");
  }
};

// === DETENER CÁMARA ===
document.getElementById("btnDetenerCamara").onclick = () => {
  stream?.getTracks().forEach(t => t.stop());
  document.getElementById("btnTomarFoto").disabled = true;
  document.getElementById("btnGrabarVideo").disabled = true;
};

// === TOMAR FOTO CON MARCA DE AGUA ===
document.getElementById("btnTomarFoto").onclick = () => {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  const now = new Date();
  const fecha = now.toLocaleDateString();
  const hora = now.toLocaleTimeString();
  const lat = document.getElementById("utm_este").value;
  const lon = document.getElementById("utm_norte").value;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(10, canvas.height - 60, 400, 50);
  ctx.fillStyle = "white";
  ctx.font = "18px Arial";
  ctx.fillText(`📅 ${fecha} ⏰ ${hora}`, 20, canvas.height - 35);
  ctx.fillText(`📍 Lat: ${lat} | Lon: ${lon}`, 20, canvas.height - 15);

  const foto = canvas.toDataURL("image/jpeg", 0.9);
  fotos.push(foto);
  const img = document.createElement("img");
  img.src = foto;
  document.getElementById("preview").appendChild(img);
};

// === GRABAR VIDEO ===
document.getElementById("btnGrabarVideo").onclick = () => {
  if (!stream) return alert("Active la cámara primero.");
  if (!mediaRecorder) {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => videoChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(videoChunks, { type: "video/mp4" });
      videos.push(blob);
      videoChunks = [];
      alert("🎥 Video guardado.");
    };
    mediaRecorder.start();
    alert("🎬 Grabando video...");
  } else {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
};

// === FIRMA ===
const sigCanvas = document.getElementById("signature");
const ctxSig = sigCanvas.getContext("2d");
let dibujando = false;
sigCanvas.addEventListener("mousedown", e => { dibujando = true; ctxSig.beginPath(); });
sigCanvas.addEventListener("mouseup", () => { dibujando = false; ctxSig.closePath(); });
sigCanvas.addEventListener("mousemove", e => dibujarFirma(e));
sigCanvas.addEventListener("touchstart", e => { dibujando = true; ctxSig.beginPath(); });
sigCanvas.addEventListener("touchend", () => { dibujando = false; ctxSig.closePath(); });
sigCanvas.addEventListener("touchmove", e => dibujarFirma(e));

function dibujarFirma(e) {
  if (!dibujando) return;
  e.preventDefault();
  const rect = sigCanvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  ctxSig.lineWidth = 2;
  ctxSig.lineCap = "round";
  ctxSig.strokeStyle = "#000";
  ctxSig.lineTo(x, y);
  ctxSig.stroke();
}

document.getElementById("btnBorrarFirma").onclick = () => {
  ctxSig.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
};

// === DESCARGAR ZIP ===
document.getElementById("btnDescargarZIP").onclick = async () => {
  const codigo = document.getElementById("codigo_usuario").value.trim() || "SIN_CODIGO";
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.text(`FORMATO DE INSPECCIÓN SFV - ${codigo}`, 10, 10);
  let y = 20;
  document.querySelectorAll("input, select, textarea").forEach(el => {
    pdf.text(`${el.id}: ${el.value}`, 10, y);
    y += 6;
    if (y > 270) { pdf.addPage(); y = 10; }
  });
  fotos.forEach((f, i) => {
    pdf.addPage();
    pdf.text(`Foto ${i + 1}`, 10, 10);
    pdf.addImage(f, "JPEG", 10, 20, 180, 150);
  });

  const zip = new JSZip();
  const carpeta = zip.folder(codigo);
  carpeta.file(`${codigo}_reporte.pdf`, pdf.output("blob"));
  fotos.forEach((f, i) => carpeta.file(`${codigo}_${i + 1}.jpg`, f.split(",")[1], { base64: true }));
  videos.forEach((v, i) => carpeta.file(`${codigo}_video${i + 1}.mp4`, v));
  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${codigo}.zip`);
};

// === SUBIR A DRIVE ===
document.getElementById("btnSubirDrive").onclick = async () => {
  const unidad = document.getElementById("unidad_negocio").value;
  const codigo = document.getElementById("codigo_usuario").value.trim();
  if (!unidad || !codigo) return alert("Seleccione unidad y código.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.text(`FORMATO DE INSPECCIÓN SFV - ${codigo}`, 10, 10);
  const pdfBlob = pdf.output("blob");

  const zip = new JSZip();
  const carpeta = zip.folder(codigo);
  carpeta.file(`${codigo}_reporte.pdf`, pdfBlob);
  fotos.forEach((f, i) => carpeta.file(`${codigo}_${i + 1}.jpg`, f.split(",")[1], { base64: true }));
  videos.forEach((v, i) => carpeta.file(`${codigo}_video${i + 1}.mp4`, v));
  const zipBlob = await zip.generateAsync({ type: "blob" });

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    const body = new URLSearchParams({
      unidad,
      suministro: codigo,
      nombre: `${codigo}.zip`,
      tipo: "application/zip",
      archivo: base64
    });
    const res = await fetch(WEBAPP_URL, { method: "POST", body });
    const msg = await res.text();
    alert(msg.includes("OK") ? "✅ Archivo subido correctamente" : "❌ Error: " + msg);
  };
  reader.readAsDataURL(zipBlob);
};

// === INICIO ===
document.addEventListener("DOMContentLoaded", cargarFormulario);
document.getElementById("btnBuscar").onclick = buscarTitular;
