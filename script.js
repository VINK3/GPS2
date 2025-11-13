// === EVIDENCIAS FOTOGRÁFICAS ===
// Envía reporte, fotos y video al Apps Script de Google Drive

// URL de tu Apps Script publicado (reemplázalo con el tuyo)
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwoqjgTrz68p-_KFQAFh2Irfi77DP4pxSFZRiEYznLVmIcMvgRD_X35hbGuP9oZCt6o/exec";

let fotos = [];

// === CARGAR FORMULARIO ===
async function cargarFormulario() {
  const cont = document.getElementById("inspection-form");
  cont.innerHTML = "⏳ Cargando formulario...";
  try {
    const res = await fetch("formulario.json?nocache=" + Date.now());
    const data = await res.json();
    cont.innerHTML = "";
    const secciones = Array.isArray(data) ? data : data.secciones;

    secciones.forEach(sec => {
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
  } catch (e) {
    cont.innerHTML = "Error al cargar formulario: " + e.message;
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

    for (const k in titular) {
      const input = document.getElementById(k);
      if (input) input.value = titular[k];
    }

    obtenerUbicacion();
    alert("✅ Datos cargados del titular.");
  } catch (e) {
    alert("Error al cargar base: " + e.message);
  }
}

// === GPS a UTM ===
function obtenerUbicacion() {
  if (!navigator.geolocation) return alert("Geolocalización no compatible.");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      const zona = 18;
      const utm = convertirLatLonUTM(latitude, longitude, zona);
      document.getElementById("utm_este").value = utm.este.toFixed(2);
      document.getElementById("utm_norte").value = utm.norte.toFixed(2);
      document.getElementById("utm_zona").value = zona;
    },
    err => alert("Error GPS: " + err.message)
  );
}

function convertirLatLonUTM(lat, lon, zona) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(f * (2 - f));
  const k0 = 0.9996;
  const λ0 = ((zona - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const φ = lat * (Math.PI / 180);
  const λ = lon * (Math.PI / 180);
  const N = a / Math.sqrt(1 - e ** 2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2;
  const C = (e ** 2 / (1 - e ** 2)) * Math.cos(φ) ** 2;
  const A = Math.cos(φ) * (λ - λ0);
  const M =
    a *
    ((1 - e ** 2 / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256) * φ -
      ((3 * e ** 2) / 8 + (3 * e ** 4) / 32 + (45 * e ** 6) / 1024) * Math.sin(2 * φ));
  const Este = 500000 + k0 * N * (A + ((1 - T + C) * A ** 3) / 6);
  const Norte = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24));
  return { este: Este, norte: lat < 0 ? Norte + 10000000 : Norte };
}

// === FIRMA ===
const sigCanvas = document.getElementById("signature");
const ctx = sigCanvas.getContext("2d");
let drawing = false;
sigCanvas.addEventListener("mousedown", startDraw);
sigCanvas.addEventListener("mouseup", stopDraw);
sigCanvas.addEventListener("mousemove", draw);
sigCanvas.addEventListener("touchstart", startDraw);
sigCanvas.addEventListener("touchend", stopDraw);
sigCanvas.addEventListener("touchmove", draw);

function startDraw(e) {
  drawing = true;
  ctx.beginPath();
}

function stopDraw() {
  drawing = false;
  ctx.closePath();
}

function draw(e) {
  if (!drawing) return;
  e.preventDefault();
  const rect = sigCanvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000";
  ctx.lineTo(x, y);
  ctx.stroke();
}

document.getElementById("btnBorrarFirma").onclick = () => {
  ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
};

// === CÁMARA ===
let stream;
document.getElementById("btnIniciarCamara").onclick = async () => {
  const video = document.getElementById("video");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    document.getElementById("btnTomarFoto").disabled = false;
    document.getElementById("btnDetenerCamara").disabled = false;
  } catch {
    alert("Error al acceder a la cámara.");
  }
};

document.getElementById("btnDetenerCamara").onclick = () => {
  stream?.getTracks().forEach(t => t.stop());
  document.getElementById("btnTomarFoto").disabled = true;
  document.getElementById("btnDetenerCamara").disabled = true;
};

document.getElementById("btnTomarFoto").onclick = () => {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const foto = canvas.toDataURL("image/jpeg", 0.9);
  fotos.push(foto);
  const img = document.createElement("img");
  img.src = foto;
  document.getElementById("preview").appendChild(img);
};

// === DESCARGAR ZIP ===
document.getElementById("btnDescargarZIP").onclick = async () => {
  if (!fotos.length) return alert("No hay fotos para guardar.");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const codigo = document.getElementById("codigo_usuario").value || "SIN_CODIGO";
  let y = 10;
  pdf.text(`REPORTE DE INSPECCIÓN - ${codigo}`, 10, y);
  y += 10;
  document.querySelectorAll("input, select, textarea").forEach(i => {
    pdf.text(`${i.id}: ${i.value}`, 10, y);
    y += 6;
    if (y > 270) { pdf.addPage(); y = 10; }
  });
  fotos.forEach((f, i) => {
    pdf.addPage();
    pdf.text(`Foto ${i + 1}`, 10, 10);
    pdf.addImage(f, "JPEG", 10, 20, 180, 160);
  });
  const pdfBlob = pdf.output("blob");

  const zip = new JSZip();
  const folder = zip.folder(codigo);
  folder.file(`${codigo}_reporte.pdf`, pdfBlob);
  fotos.forEach((f, i) => folder.file(`${codigo}_${i + 1}.jpg`, f.split(",")[1], { base64: true }));
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
  pdf.text(`REPORTE DE INSPECCIÓN - ${codigo}`, 10, 10);
  const pdfBlob = pdf.output("blob");

  const zip = new JSZip();
  const folder = zip.folder(codigo);
  folder.file(`${codigo}_reporte.pdf`, pdfBlob);
  fotos.forEach((f, i) => folder.file(`${codigo}_${i + 1}.jpg`, f.split(",")[1], { base64: true }));
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
    alert(msg.includes("OK") ? "✅ Archivo guardado en Drive" : "❌ Error: " + msg);
  };
  reader.readAsDataURL(zipBlob);
};

// === INICIO ===
document.addEventListener("DOMContentLoaded", cargarFormulario);
document.getElementById("btnBuscar").onclick = buscarTitular;
