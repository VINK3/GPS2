// === EVIDENCIAS FOTOGRÁFICAS ===
// Envía reporte, fotos y video al Apps Script de Google Drive

const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxLDO6-Y12quj_RYuC5XYQK5DilAlCoTt1d1HkGWXu7oBPtY8zySO2uDIY-RF2TW_g/exec"; // <--- reemplaza con tu URL /exec

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const captureBtn = document.getElementById("capture-btn");
  const videoBtn = document.getElementById("video-btn");
  const pdfBtn = document.getElementById("pdf-btn");
  const zipBtn = document.getElementById("zip-btn");
  const resetBtn = document.getElementById("reset-btn");
  const thumbnailsDiv = document.getElementById("photo-thumbnails");
  const videoThumbs = document.getElementById("video-thumbnails");
  const firmaCanvas = document.getElementById("firma-canvas");
  const firmaCtx = firmaCanvas.getContext("2d");
  const buscarBtn = document.getElementById("buscar-datos");

  let photos = [];
  let recordedVideoBlob = null;
  let currentStream = null;
  let currentPosition = null;
  let mediaRecorder;
  let videoChunks = [];

  // === CARGAR FORMULARIO JSON ===
  fetch("formulario.json")
    .then(res => res.json())
    .then(data => {
      const form = document.getElementById("inspection-form");
      form.innerHTML = "";
      data.secciones.forEach(sec => {
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
              o.value = op;
              o.textContent = op;
              input.appendChild(o);
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
        form.appendChild(fieldset);
      });
    })
    .catch(err => console.error("Error cargando formulario.json:", err));

  // === BUSCAR DATOS EN BASE JSON ===
  buscarBtn.onclick = async () => {
    const codigo = document.getElementById("codigo-suministro").value.trim();
    if (!codigo) return alert("Ingrese un código de suministro.");

    try {
      const res = await fetch("base_titulares.json");
      if (!res.ok) throw new Error("No se pudo cargar base_titulares.json");
      const base = await res.json();

      // Buscar por codigo_usuario (tolerante a mayúsculas, espacios, etc.)
      const usuario = base.find(
        u => String(u.codigo_usuario).trim().toLowerCase() === codigo.trim().toLowerCase()
      );

      if (!usuario) {
        alert("⚠️ No se encontró el suministro en la base de datos.");
        console.warn("Ejemplo de código:", base[0]?.codigo_usuario);
        return;
      }

      // Rellenar formulario (por ID o etiqueta parecida)
      const camposFormulario = Array.from(document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea"));
      Object.entries(usuario).forEach(([clave, valor]) => {
        const exacto = document.getElementById(clave);
        if (exacto) {
          exacto.value = valor;
          return;
        }
        const parcial = camposFormulario.find(el =>
          el.id.toLowerCase().includes(clave.toLowerCase()) ||
          (el.previousElementSibling && el.previousElementSibling.textContent.toLowerCase().includes(clave.toLowerCase()))
        );
        if (parcial) parcial.value = valor;
      });

      alert(`✅ Datos cargados para ${usuario.nombres_apellidos || "el suministro ingresado"}.`);
    } catch (err) {
      alert("Error al cargar base de datos: " + err.message);
    }
  };

  // === FIRMA ===
  firmaCtx.lineWidth = 2;
  firmaCtx.lineCap = "round";
  let dibujando = false;

  const getCoords = e => {
    const rect = firmaCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (firmaCanvas.width / rect.width),
      y: (clientY - rect.top) * (firmaCanvas.height / rect.height)
    };
  };

  ["mousedown", "touchstart"].forEach(ev =>
    firmaCanvas.addEventListener(ev, e => {
      e.preventDefault();
      dibujando = true;
      const { x, y } = getCoords(e);
      firmaCtx.beginPath();
      firmaCtx.moveTo(x, y);
    })
  );
  ["mousemove", "touchmove"].forEach(ev =>
    firmaCanvas.addEventListener(ev, e => {
      if (!dibujando) return;
      e.preventDefault();
      const { x, y } = getCoords(e);
      firmaCtx.lineTo(x, y);
      firmaCtx.stroke();
    })
  );
  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach(ev =>
    firmaCanvas.addEventListener(ev, e => {
      e.preventDefault();
      dibujando = false;
    })
  );

  document.getElementById("clear-firma").onclick = () =>
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);

  // === GEOLOCALIZACIÓN ===
  if ("geolocation" in navigator)
    navigator.geolocation.getCurrentPosition(pos => (currentPosition = pos.coords));

  // === CÁMARA ===
  async function getCameraStream() {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: true
    });
  }

  startBtn.onclick = async () => {
    try {
      currentStream = await getCameraStream();
      video.srcObject = currentStream;
      await video.play();
      captureBtn.disabled = false;
      videoBtn.disabled = false;
      stopBtn.disabled = false;
    } catch (err) {
      alert("Error iniciando cámara: " + err.message);
    }
  };

  stopBtn.onclick = () => {
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      captureBtn.disabled = true;
      videoBtn.disabled = true;
      stopBtn.disabled = true;
    }
  };

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
    ctx.fillText(now, 15, canvas.height - 30);
    ctx.fillText(coords, 15, canvas.height - 10);
    const photo = canvas.toDataURL("image/jpeg", 0.9);
    photos.push(photo);
    const img = document.createElement("img");
    img.src = photo;
    thumbnailsDiv.appendChild(img);
    pdfBtn.disabled = false;
    zipBtn.disabled = false;
  };

  // === VIDEO ===
  videoBtn.onclick = () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      if (!currentStream) return alert("Activa la cámara antes de grabar.");
      mediaRecorder = new MediaRecorder(currentStream, { mimeType: "video/webm" });
      videoChunks = [];
      mediaRecorder.ondataavailable = e => videoChunks.push(e.data);
      mediaRecorder.onstop = () => {
        recordedVideoBlob = new Blob(videoChunks, { type: "video/webm" });
        const videoURL = URL.createObjectURL(recordedVideoBlob);
        const vid = document.createElement("video");
        vid.src = videoURL;
        vid.controls = true;
        vid.width = 200;
        videoThumbs.appendChild(vid);
        alert("🎥 Video grabado correctamente.");
      };
      mediaRecorder.start();
      videoBtn.textContent = "⏹ Detener";
    } else {
      mediaRecorder.stop();
      videoBtn.textContent = "🎥 Grabar Video";
    }
  };

  // === REINICIAR ===
  resetBtn.onclick = () => {
    photos = [];
    thumbnailsDiv.innerHTML = "";
    videoThumbs.innerHTML = "";
    recordedVideoBlob = null;
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
    pdfBtn.disabled = true;
    zipBtn.disabled = true;
  };

  // === SUBIR Y GENERAR PDF ===
  pdfBtn.onclick = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const suministro = document.getElementById("codigo-suministro").value.trim();
    const unidad = document.getElementById("unidad").value;
    if (!suministro || !unidad) return alert("Debe ingresar código y unidad.");

    doc.text("FORMATO DE INSPECCIÓN DE INSTALACIÓN RER AUTÓNOMA", 10, 20);
    doc.text(`Código de Suministro: ${suministro}`, 10, 30);
    let y = 40;
    document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea").forEach(el => {
      doc.text(`${el.id}: ${el.value}`, 10, y);
      y += 7;
    });
    const firmaImg = firmaCanvas.toDataURL("image/png");
    doc.addImage(firmaImg, "PNG", 10, y + 5, 80, 40);
    const pdfBlob = doc.output("blob");
    await subirArchivo(pdfBlob, `${suministro}_reporte.pdf`, "application/pdf", unidad, suministro);

    for (let i = 0; i < photos.length; i++) {
      const blob = await (await fetch(photos[i])).blob();
      await subirArchivo(blob, `${suministro}_${i + 1}.jpg`, "image/jpeg", unidad, suministro);
    }

    if (recordedVideoBlob)
      await subirArchivo(recordedVideoBlob, `${suministro}_video.webm`, "video/webm", unidad, suministro);

    alert(`✅ Archivos guardados en Google Drive (${unidad} / ${suministro})`);
  };

  // === DESCARGAR ZIP LOCAL ===
  zipBtn.onclick = async () => {
    const zip = new JSZip();
    const suministro = document.getElementById("codigo-suministro").value.trim();
    const carpeta = zip.folder(suministro);
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF();
    doc.text(`Suministro: ${suministro}`, 10, 20);
    const pdfBlob = doc.output("blob");
    carpeta.file(`${suministro}_reporte.pdf`, pdfBlob);

    for (let i = 0; i < photos.length; i++) {
      const blob = await (await fetch(photos[i])).blob();
      carpeta.file(`${suministro}_${i + 1}.jpg`, blob);
    }

    if (recordedVideoBlob)
      carpeta.file(`${suministro}_video.webm`, recordedVideoBlob);

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${suministro}.zip`);
  };
});

async function subirArchivo(blob, nombre, tipo, unidad, suministro) {
  const reader = new FileReader();
  return new Promise(resolve => {
    reader.onloadend = async () => {
      const base64Data = reader.result.split(",")[1];
      const body = new URLSearchParams({ unidad, suministro, nombre, tipo, archivo: base64Data });
      await fetch(WEBAPP_URL, { method: "POST", body });
      resolve();
    };
    reader.readAsDataURL(blob);
  });
}
