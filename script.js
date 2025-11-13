// === EVIDENCIAS FOTOGRÁFICAS ===
// Envía reporte, fotos y video al Apps Script de Google Drive

const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxLDO6-Y12quj_RYuC5XYQK5DilAlCoTt1d1HkGWXu7oBPtY8zySO2uDIY-RF2TW_g/exec"; // <--- reemplaza con tu URL /exec

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const captureBtn = document.getElementById("capture-btn");
  const startBtn = document.getElementById("start-btn");
  const pdfBtn = document.getElementById("pdf-btn");
  const resetBtn = document.getElementById("reset-btn");
  const thumbnailsDiv = document.getElementById("photo-thumbnails");
  const firmaCanvas = document.getElementById("firma-canvas");
  const firmaCtx = firmaCanvas.getContext("2d");

  let photos = [];
  let currentPosition = null;
  let recordedVideo = null;

  // === FIRMA ===
  firmaCtx.strokeStyle = "#000";
  firmaCtx.lineWidth = 2;
  firmaCtx.lineCap = "round";
  let dibujando = false;

  const getCoords = (e) => {
    const rect = firmaCanvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * (firmaCanvas.width / rect.width);
    const y = (clientY - rect.top) * (firmaCanvas.height / rect.height);
    return { x, y };
  };

  const startDraw = (e) => {
    e.preventDefault();
    dibujando = true;
    const { x, y } = getCoords(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(x, y);
  };
  const draw = (e) => {
    if (!dibujando) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    firmaCtx.lineTo(x, y);
    firmaCtx.stroke();
  };
  const stopDraw = (e) => {
    e.preventDefault();
    dibujando = false;
  };

  ["mousedown", "touchstart"].forEach((ev) =>
    firmaCanvas.addEventListener(ev, startDraw, { passive: false })
  );
  ["mousemove", "touchmove"].forEach((ev) =>
    firmaCanvas.addEventListener(ev, draw, { passive: false })
  );
  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((ev) =>
    firmaCanvas.addEventListener(ev, stopDraw, { passive: false })
  );

  document.getElementById("clear-firma").onclick = () =>
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);

  // === GEO ===
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => (currentPosition = pos.coords),
      (err) => console.warn("No se obtuvo ubicación:", err)
    );
  }

  // === CÁMARA ===
  async function getCameraStream() {
    const tryCam = async (constraints) => {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        throw e;
      }
    };
    try {
      return await tryCam({ video: { facingMode: { exact: "environment" } } });
    } catch {
      try {
        return await tryCam({ video: { facingMode: { ideal: "environment" } } });
      } catch {
        return await tryCam({ video: true });
      }
    }
  }

  startBtn.onclick = async () => {
    try {
      const stream = await getCameraStream();
      video.srcObject = stream;
      await video.play();
      captureBtn.disabled = false;
    } catch (err) {
      alert("No se pudo acceder a la cámara: " + err.message);
    }
  };

  captureBtn.onclick = () => {
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const coords = currentPosition
      ? `${currentPosition.latitude.toFixed(6)}, ${currentPosition.longitude.toFixed(6)}`
      : "Ubicación no disponible";
    const now = new Date().toLocaleString();

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(10, canvas.height - 55, 420, 45);
    ctx.fillStyle = "black";
    ctx.font = "16px Arial";
    ctx.fillText(now, 15, canvas.height - 30);
    ctx.fillText(coords, 15, canvas.height - 10);

    const photo = canvas.toDataURL("image/jpeg", 0.9);
    photos.push(photo);

    const thumb = document.createElement("img");
    thumb.src = photo;
    thumbnailsDiv.appendChild(thumb);

    pdfBtn.disabled = false;
  };

  resetBtn.onclick = () => {
    photos = [];
    thumbnailsDiv.innerHTML = "";
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
    pdfBtn.disabled = true;
  };

  pdfBtn.onclick = async () => {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const suministro = document.getElementById("codigo-suministro").value.trim();
      const unidad = document.getElementById("unidad").value;

      // Generar PDF simple
      doc.setFontSize(14);
      doc.text("FORMATO DE INSPECCIÓN RER AUTÓNOMA", 10, 20);
      doc.setFontSize(11);
      doc.text(`Código de Suministro: ${suministro}`, 10, 30);

      let y = 40;
      const campos = {};
      document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea")
        .forEach((el) => {
          campos[el.id] = el.value || "";
          doc.text(`${el.id}: ${el.value}`, 10, y);
          y += 7;
        });

      // Firma
      const firmaImg = firmaCanvas.toDataURL("image/png");
      doc.addImage(firmaImg, "PNG", 10, y + 5, 80, 40);

      // Subir PDF
      const pdfBlob = doc.output("blob");
      await subirArchivo(pdfBlob, `${suministro}_reporte.pdf`, "application/pdf", unidad, suministro);

      // Subir fotos
      for (let i = 0; i < photos.length; i++) {
        const fotoBase64 = photos[i].split(",")[1];
        const blob = await (await fetch(photos[i])).blob();
        await subirArchivo(blob, `${suministro}_${i + 1}.jpg`, "image/jpeg", unidad, suministro);
      }

      alert(`✅ Archivos guardados en Google Drive (${unidad} / ${suministro})`);
    } catch (err) {
      alert("Error subiendo archivos: " + err.message);
    }
  };
});

async function subirArchivo(blob, nombre, tipo, unidad, suministro) {
  const reader = new FileReader();
  return new Promise((resolve) => {
    reader.onloadend = async () => {
      const base64Data = reader.result.split(",")[1];
      const body = new URLSearchParams({
        unidad,
        suministro,
        nombre,
        tipo,
        archivo: base64Data,
      });
      await fetch(WEBAPP_URL, { method: "POST", body });
      resolve();
    };
    reader.readAsDataURL(blob);
  });
}
