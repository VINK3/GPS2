// === EVIDENCIAS FOTOGRÁFICAS ===
// Envía reporte, fotos y video al Apps Script de Google Drive

const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwoqjgTrz68p-_KFQAFh2Irfi77DP4pxSFZRiEYznLVmIcMvgRD_X35hbGuP9oZCt6o/exec"; // <-- reemplaza con tu URL /exec del Apps Script

document.addEventListener("DOMContentLoaded", () => {
  const formContainer = document.getElementById("inspection-form");
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const captureBtn = document.getElementById("capture-btn");
  const videoBtn = document.getElementById("video-btn");
  const pdfBtn = document.getElementById("pdf-btn");
  const zipBtn = document.getElementById("zip-btn");
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

  // === 1️⃣ CARGAR FORMULARIO JSON ===
// === CARGAR FORMULARIO JSON (compatible y con diagnóstico) ===
async function cargarFormulario() {
  const formContainer = document.getElementById("inspection-form");
  formContainer.innerHTML = "<p>Cargando formulario...</p>";

  try {
    const res = await fetch("formulario.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar formulario.json (${res.status})`);

    const data = await res.json();
    console.log("📄 Datos de formulario.json cargados:", data);

    // Detectar si es array o tiene propiedad "secciones"
    const secciones = Array.isArray(data)
      ? data
      : Array.isArray(data.secciones)
      ? data.secciones
      : [];

    if (!secciones.length) {
      throw new Error("El archivo formulario.json no contiene secciones válidas.");
    }

    formContainer.innerHTML = "";

    secciones.forEach((sec, i) => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = sec.titulo || `Sección ${i + 1}`;
      fieldset.appendChild(legend);

      if (!Array.isArray(sec.campos)) {
        console.warn(`⚠️ La sección '${sec.titulo}' no tiene 'campos' válidos.`);
        return;
      }

      sec.campos.forEach(c => {
        const label = document.createElement("label");
        label.textContent = c.etiqueta || c.id || "Campo sin nombre";
        fieldset.appendChild(label);

        let input;
        if (c.tipo === "select" && Array.isArray(c.opciones)) {
          input = document.createElement("select");
          c.opciones.forEach(op => {
            const opt = document.createElement("option");
            opt.value = op;
            opt.textContent = op;
            input.appendChild(opt);
          });
        } else if (c.tipo === "textarea") {
          input = document.createElement("textarea");
        } else {
          input = document.createElement("input");
          input.type = c.tipo || "text";
        }

        input.id = c.id || `campo_${Math.random().toString(36).substring(2, 8)}`;
        input.required = true;
        fieldset.appendChild(input);
      });

      formContainer.appendChild(fieldset);
    });

    console.log("✅ Formulario cargado correctamente.");
  } catch (err) {
    console.error("❌ Error al cargar formulario:", err);
    formContainer.innerHTML = `<p style="color:red;">Error al cargar formulario: ${err.message}</p>`;
  }
}


  // === 2️⃣ BUSCAR DATOS EN BASE JSON ===
  buscarBtn.onclick = async () => {
    const codigo = document.getElementById("codigo-suministro").value.trim();
    if (!codigo) return alert("Ingrese un código de suministro.");

    try {
      const res = await fetch("base_titulares.json");
      if (!res.ok) throw new Error("No se pudo cargar base_titulares.json");
      const base = await res.json();

      const usuario = base.find(
        u => String(u.codigo_usuario).trim().toLowerCase() === codigo.trim().toLowerCase()
      );

      if (!usuario) {
        alert("⚠️ No se encontró el suministro.");
        console.warn("Ejemplo de código:", base[0]?.codigo_usuario);
        return;
      }

      const camposFormulario = Array.from(
        document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea")
      );

      Object.entries(usuario).forEach(([clave, valor]) => {
        const exacto = document.getElementById(clave);
        if (exacto) {
          exacto.value = valor;
          return;
        }
        const parcial = camposFormulario.find(el =>
          el.id.toLowerCase().includes(clave.toLowerCase()) ||
          (el.previousElementSibling &&
            el.previousElementSibling.textContent.toLowerCase().includes(clave.toLowerCase()))
        );
        if (parcial) parcial.value = valor;
      });

      alert(`✅ Datos cargados para ${usuario.nombres_apellidos || "el suministro ingresado"}.`);
    } catch (err) {
      alert("Error al cargar base_titulares.json: " + err.message);
    }
  };

  // === 3️⃣ FIRMA DIGITAL ===
  firmaCtx.lineWidth = 2;
  let dibujando = false;
  const getCoords = e => {
    const rect = firmaCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  firmaCanvas.addEventListener("mousedown", e => {
    dibujando = true;
    const { x, y } = getCoords(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(x, y);
  });
  firmaCanvas.addEventListener("mousemove", e => {
    if (!dibujando) return;
    const { x, y } = getCoords(e);
    firmaCtx.lineTo(x, y);
    firmaCtx.stroke();
  });
  firmaCanvas.addEventListener("mouseup", () => (dibujando = false));
  firmaCanvas.addEventListener("mouseleave", () => (dibujando = false));
  firmaCanvas.addEventListener("touchstart", e => {
    dibujando = true;
    const { x, y } = getCoords(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(x, y);
  });
  firmaCanvas.addEventListener("touchmove", e => {
    if (!dibujando) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    firmaCtx.lineTo(x, y);
    firmaCtx.stroke();
  });
  firmaCanvas.addEventListener("touchend", () => (dibujando = false));

  document.getElementById("clear-firma").onclick = () =>
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);

  // === 4️⃣ CÁMARA ===
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
  };

  // === 5️⃣ GENERAR PDF ===
  pdfBtn.onclick = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const suministro = document.getElementById("codigo-suministro").value.trim();
    const unidad = document.getElementById("unidad").value;

    doc.setFontSize(12);
    doc.text("FORMATO DE INSPECCIÓN DE INSTALACIÓN RER AUTÓNOMA", 10, 20);
    doc.text(`Código de Suministro: ${suministro}`, 10, 30);
    let y = 40;

    document.querySelectorAll("#inspection-form input, #inspection-form select, #inspection-form textarea").forEach(el => {
      const label = el.previousElementSibling ? el.previousElementSibling.textContent : el.id;
      doc.text(`${label}: ${el.value}`, 10, y);
      y += 7;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    // Firma
    const firmaImg = firmaCanvas.toDataURL("image/png");
    doc.addImage(firmaImg, "PNG", 10, y + 5, 80, 40);
    y += 50;

    // Agregar fotos
    for (let i = 0; i < photos.length; i++) {
      doc.addPage();
      doc.text(`Foto ${i + 1}`, 10, 20);
      doc.addImage(photos[i], "JPEG", 10, 30, 180, 130);
    }

    const pdfBlob = doc.output("blob");

    // Subir a Drive
    await subirArchivo(pdfBlob, `${suministro}_reporte.pdf`, "application/pdf", unidad, suministro);

    alert(`✅ Reporte ${suministro} guardado correctamente en Google Drive (${unidad})`);
  };

  // === 6️⃣ SUBIR ARCHIVOS A DRIVE ===
  async function subirArchivo(blob, nombre, tipo, unidad, suministro) {
    const reader = new FileReader();
    return new Promise(resolve => {
      reader.onloadend = async () => {
        const base64Data = reader.result.split(",")[1];
        const body = new URLSearchParams({ unidad, suministro, nombre, tipo, archivo: base64Data });
        const res = await fetch(WEBAPP_URL, { method: "POST", body });
        if (res.ok) console.log("Subido:", nombre);
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  }
});

