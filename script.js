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
  let recordedVideoBlob = null;
  let currentPosition = null;
  let mediaRecorder;
  let videoChunks = [];

  // === FIRMA ===
  firmaCtx.strokeStyle = "#000";
  firmaCtx.lineWidth = 2;
  firmaCtx.lineCap = "round";
  let dibujando = false;

  const getCoords = (e) => {
    const rect = firmaCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (firmaCanvas.width / rect.width),
      y: (clientY - rect.top) * (firmaCanvas.height / rect.height),
    };
  };

  firmaCanvas.addEventListener("mousedown", (e) => {
    dibujando = true;
    const { x, y } = getCoords(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(x, y);
  });
  firmaCanvas.addEventListener("mousemove", (e) => {
    if (!dibujando) return;
    const { x, y } = getCoords(e);
    firmaCtx.lineTo(x, y);
    firmaCtx.stroke();
  });
  firmaCanvas.addEventListener("mouseup", () => (dibujando = false));
  firmaCanvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    dibujando = true;
    const { x, y } = getCoords(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(x, y);
  });
  firmaCanvas.addEventListener("touchmove", (e) => {
    if (!dibujando) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    firmaCtx.lineTo(x, y);
    firmaCtx.stroke();
  });
  firmaCanvas.addEventListener("touchend", () => (dibujando = false));
  document.getElementById("clear-firma").onclick = () =>
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);

  // === GEOLOCALIZACIÓN ===
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => (currentPosition = pos.coords),
      (err) => console.warn("No se pudo obtener ubicación:", err)
    );
  }

  // === CARGAR FORMULARIO JSON ===
  fetch("formulario.json")
    .then(res => res.json())
    .then(data => {
      const formContainer = document.getElementById("inspection-form");
      data.secciones.forEach(sec => {
        const section = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = sec.titulo;
        section.appendChild(legend);

        sec.campos.forEach(campo => {
          const label = document.createElement("label");
          label.textContent = campo.etiqueta;
          section.appendChild(label);

          let input;
          if (campo.tipo === "select") {
            input = document.createElement("select");
            campo.opciones.forEach(op => {
              const option = document.createElement("option");
              option.value = op;
              option.textContent = op;
              input.appendChild(option);
            });
          } else if (campo.tipo === "textarea") {
            input = document.createElement("textarea");
          } else {
            input = document.createElement("input");
            input.type = campo.tipo || "text";
          }
          input.id = campo.id;
          section.appendChild(input);
        });

        formContainer.appendChild(section);
      });
    })
    .catch(err => console.error("Error cargando formulario.json:", err));

  // === CÁMARA ===
  async function getCameraStream() {
    try {
      const constraints = {
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      alert("Error al acceder a la cámara: " + err.message);
      throw err;
    }
  }

  startBtn.onclick = async () => {
    try {
      const stream = await getCameraStream();
      video.srcObject = stream;
      await new Promise((r) => setTimeout(r, 500));
      await video.play().catch(() => setTimeout(() => video.play(), 300));
      captureBtn.disabled = false;
      document.getElementById("video-btn").disabled = false;
    } catch (err) {
      alert("No se pudo iniciar la cámara: " + err.message);
    }
  };

  // === FOTOS ===
  captureBtn.onclick = () => {
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const coords = currentPosition
      ? `${currentPosition.latitude.toFixed(6)}, ${currentPosition.longitude.toFixed(6)}`
      : "Ubicación no disponible";
    const now = new Date().toLocaleString();

    ctx.fillStyle = "rgba(255,255,255,0.7)";
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
    document.getElementById("video-thumbnails").innerHTML = "";
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
    recordedVideoBlob = null;
    pdfBtn.disabled = true;
  };

  // === VIDEO ===
  const videoBtn = document.getElementById("video-btn");
  videoBtn.onclick = async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      const stream = video.srcObject;
      if (!stream) return alert("Activa la cámara antes de grabar.");
      mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      videoChunks = [];
      mediaRecorder.ondataavailable = (e) => videoChunks.push(e.data);
      mediaRecorder.onstop = () => {
        recordedVideoBlob = new Blob(videoChunks, { type: "video/webm" });
        const videoURL = URL.createObjectURL(recordedVideoBlob);
        const vid = document.createElement("video");
        vid.src = videoURL;
        vid.controls = true;
        vid.width = 200;
        document.getElementById("video-thumbnails").appendChild(vid);
        alert("🎥 Video grabado correctamente.");
      };
      mediaRecorder.start();
      videoBtn.textContent = "⏹ Detener Grabación";
    } else {
      mediaRecorder.stop();
      videoBtn.textContent = "🎥 Grabar Video";
    }
  };

  // === GENERAR Y SUBIR ARCHIVOS ===
  pdfBtn.onclick = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const suministro = document.getElementById("codigo-suministro").value.trim();
    const unidad = document.getElementById("unidad").value;

    if (!suministro || !unidad) {
      alert("Debe ingresar el código de suministro y la unidad.");
      return;
    }

    doc.setFontSize(14);
    doc.text("FORMATO DE INSPECCIÓN DE INSTALACIÓN RER AUTÓNOMA", 10, 20);
    doc.setFontSize(11);
    doc.text(`Código de Suministro: ${suministro}`, 10, 30);

    let y = 40;
    document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea").forEach((el) => {
      doc.text(`${el.id}: ${el.value}`, 10, y);
      y += 7;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    // Firma
    const firmaImg = firmaCanvas.toDataURL("image/png");
    doc.addImage(firmaImg, "PNG", 10, y + 5, 80, 40);

    const pdfBlob = doc.output("blob");
    await subirArchivo(pdfBlob, `${suministro}_reporte.pdf`, "application/pdf", unidad, suministro);

    // Fotos
    for (let i = 0; i < photos.length; i++) {
      const blob = await (await fetch(photos[i])).blob();
      await subirArchivo(blob, `${suministro}_${i + 1}.jpg`, "image/jpeg", unidad, suministro);
    }

    // Video
    if (recordedVideoBlob) {
      await subirArchivo(recordedVideoBlob, `${suministro}_video.webm`, "video/webm", unidad, suministro);
    }

    alert(`✅ Archivos guardados en Google Drive (${unidad} / ${suministro})`);
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
