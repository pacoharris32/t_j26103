document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loader-container');
    const filtroId = document.getElementById('filtro-id');
    const filtroEstado = document.getElementById('filtro-estado');
    const filtroAcuifero = document.getElementById('filtro-acuifero');
    const filtroTexto = document.getElementById('filtro-texto');
    const tablaResultados = document.getElementById('tabla-resultados');
    const paginationContainer = document.querySelector('.pagination');
    const contadorResultados = document.getElementById('contador-resultados');

    const containerId = document.getElementById('container-id-search');
    const triggerId = document.getElementById('trigger-id');
    const btnLimpiar = document.getElementById('btn-limpiar-filtros');

    let estudiosData = [];
    let acuiferosData = [];
    let estudiosFiltrados = [];
    let currentPage = 1;
    const studiesPerPage = 20;

    // Variables de Ordenamiento
    let currentSortColumn = '';
    let isAscending = true;

    // =========================================================
    // CARGA DE DATOS
    // =========================================================
    const cargarDatos = async () => {
        try {
            const [resEst, resAcu] = await Promise.all([
                fetch('data/T_ESTUDIOS.csv'),
                fetch('data/T_ACUIFEROS_ESTADOS.csv')
            ]);
            estudiosData = parseCSVRobust(await resEst.text());
            acuiferosData = parseCSVRobust(await resAcu.text());
            poblarEstados();
            aplicarFiltrosYRenderizar();
        } catch (e) {
            console.error("Error al cargar los datos:", e);
        } finally {
            loader.style.display = 'none';
        }
    };

    const parseCSVRobust = (text) => {
        const rows = [];
        let row = [], field = '', inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i], next = text[i + 1];
            if (char === '"' && inQuotes && next === '"') { field += '"'; i++; }
            else if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { row.push(field); field = ''; }
            else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (field !== '' || row.length > 0) { row.push(field); rows.push(row); field = ''; row = []; }
                if (char === '\r' && next === '\n') i++;
            } else field += char;
        }
        if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
        const headers = rows[0].map(h => h.trim());
        return rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = (r[i] || "").trim());
            obj.NORMALIZED_ID = (obj['ID_ESTUDIO'] || obj['ID_ESTUDIOS'] || r[0] || "").trim();
            return obj;
        });
    };

    const poblarEstados = () => {
        const estados = [...new Set(acuiferosData.map(a => a.ESTADO))].filter(Boolean).sort();
        estados.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e; opt.textContent = e;
            filtroEstado.appendChild(opt);
        });
    };

    // =========================================================
    // LÓGICA DE ORDENAMIENTO
    // =========================================================
    window.ordenarTabla = (columna) => {
        if (currentSortColumn === columna) {
            isAscending = !isAscending;
        } else {
            currentSortColumn = columna;
            isAscending = true;
        }

        estudiosFiltrados.sort((a, b) => {
            let v1 = a[columna] || '';
            let v2 = b[columna] || '';

            if (columna === 'NORMALIZED_ID' || columna === 'AÑO') {
                const n1 = parseInt(v1.toString().replace(/\D/g, '')) || 0;
                const n2 = parseInt(v2.toString().replace(/\D/g, '')) || 0;
                return isAscending ? n1 - n2 : n2 - n1;
            }

            v1 = v1.toString().toLowerCase();
            v2 = v2.toString().toLowerCase();
            return isAscending ? v1.localeCompare(v2) : v2.localeCompare(v1);
        });

        currentPage = 1;
        renderizarTabla();
    };

    // =========================================================
    // FILTROS
    // =========================================================
    const aplicarFiltrosYRenderizar = () => {
        const idV = filtroId.value.trim();
        const edoV = filtroEstado.value;
        const acuV = filtroAcuifero.value;
        const txtV = filtroTexto.value.toLowerCase().trim();

        let filtrados = estudiosData;

        if (idV) filtrados = filtrados.filter(e => e.NORMALIZED_ID === idV);
        if (edoV || acuV) {
            const idsValidos = new Set(acuiferosData
                .filter(a => (edoV ? a.ESTADO === edoV : true) && (acuV ? a.ACUIFERO === acuV : true))
                .map(a => a.NORMALIZED_ID));
            filtrados = filtrados.filter(e => idsValidos.has(e.NORMALIZED_ID));
        }
        if (txtV) {
            filtrados = filtrados.filter(e => (e.TITULO_BUSQUEDA + ' ' + e.TITULO_ORIGINAL).toLowerCase().includes(txtV));
        }

        estudiosFiltrados = filtrados;
        contadorResultados.textContent = `${estudiosFiltrados.length} estudios encontrados.`;
        currentPage = 1;
        renderizarTabla();
    };

    // =========================================================
    // RENDERIZADO DE TABLA
    // =========================================================
    const renderizarTabla = () => {
        tablaResultados.innerHTML = '';
        const inicio = (currentPage - 1) * studiesPerPage;
        const pagina = estudiosFiltrados.slice(inicio, inicio + studiesPerPage);

        if (pagina.length === 0) {
            tablaResultados.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No se encontraron resultados.</td></tr>';
            return;
        }

        pagina.forEach(e => {
            const hasCaratula = e.CARATULA && e.CARATULA.trim() !== "" && e.CARATULA !== "#";
            
            let pdfContent = '';
            if (e.PDF && e.PDF.trim() !== "" && e.PDF !== "#") {
                const urls = e.PDF.split(';');
                pdfContent = `<div class="pdf-container">` +
                    urls.map(url => {
                        const cleanUrl = url.trim();
                        if (!cleanUrl) return '';
                        const nombreArchivo = cleanUrl.split('/').pop();
                        const match = cleanUrl.match(/(TOMO\d+)/i);
                        const alias = match ? match[0].toUpperCase() : 'PDF';
                        
                        return `<a href="${cleanUrl}" target="_blank" class="pdf-link" 
                                   title="Descargar estudio: ${nombreArchivo}" 
                                   download="${nombreArchivo}">
                                    <i class="fa-solid fa-file-pdf"></i> ${alias}
                                </a>`;
                    }).join('') + `</div>`;
            } else {
                pdfContent = `<i class="fa-regular fa-file-pdf icon-disabled"></i>`;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="ID">${e.NORMALIZED_ID}</td>
                <td data-label="TÍTULO" style="text-align:left;">${e.TITULO_ORIGINAL || e.TITULO_BUSQUEDA}</td>
                <td data-label="AÑO">${e.AÑO || ''}</td>
                <td data-label="VISTA RÁPIDA" style="text-align:center;">
                    ${hasCaratula ? `<a href="${e.CARATULA}" target="_blank" title="Ver Carátula"><i class="fa-regular fa-image"></i></a>` : `<i class="fa-regular fa-image icon-disabled"></i>`}
                </td>
                <td data-label="ESTUDIO" class="td-pdf-container">${pdfContent}</td>
            `;
            tablaResultados.appendChild(row);
        });
        renderizarPaginacion();
    };

    // =========================================================
    // PAGINACIÓN
    // =========================================================
    const renderizarPaginacion = () => {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(estudiosFiltrados.length / studiesPerPage);
        if (totalPages <= 1) return;

        const maxButtons = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);

        const crearBoton = (p, texto, activo = false) => {
            const btn = document.createElement('button');
            btn.textContent = texto;
            if (activo) btn.classList.add('active');
            btn.addEventListener('click', () => {
                currentPage = p;
                renderizarTabla();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            return btn;
        };

        paginationContainer.appendChild(crearBoton(1, '«'));
        for (let i = startPage; i <= endPage; i++) {
            paginationContainer.appendChild(crearBoton(i, i, i === currentPage));
        }
        paginationContainer.appendChild(crearBoton(totalPages, '»'));
    };

    // =========================================================
    // EVENTOS DE FILTROS
    // =========================================================
    filtroEstado.addEventListener('change', () => {
        const edo = filtroEstado.value;
        filtroAcuifero.innerHTML = '<option value="">-- Todos los Acuíferos --</option>';
        if (edo) {
            const acus = [...new Set(acuiferosData.filter(a => a.ESTADO === edo).map(a => a.ACUIFERO))].sort();
            acus.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a; opt.textContent = a;
                filtroAcuifero.appendChild(opt);
            });
        }
        aplicarFiltrosYRenderizar();
    });

    filtroAcuifero.addEventListener('change', aplicarFiltrosYRenderizar);
    filtroId.addEventListener('input', aplicarFiltrosYRenderizar);
    filtroTexto.addEventListener('input', aplicarFiltrosYRenderizar);

    if (triggerId) {
        triggerId.addEventListener('click', () => containerId.classList.toggle('active'));
    }

    btnLimpiar.addEventListener('click', () => {
        filtroId.value = '';
        filtroEstado.value = '';
        filtroAcuifero.innerHTML = '<option value="">-- Todos los Acuíferos --</option>';
        filtroTexto.value = '';
        if (containerId) containerId.classList.remove('active');
        currentSortColumn = '';
        aplicarFiltrosYRenderizar();
    });

    // =========================================================
    // EXPORTAR A CSV (ACTUALIZADO: INCLUYE VISTA RÁPIDA Y ESTUDIO)
    // =========================================================
    document.getElementById('btn-exportar').addEventListener('click', () => {
        let csv = "ID,TITULO,AÑO,VISTA RÁPIDA,ESTUDIO\n";
        
        estudiosFiltrados.forEach(e => {
            const id = e.NORMALIZED_ID || "";
            const tituloLimpio = (e.TITULO_ORIGINAL || e.TITULO_BUSQUEDA || "").replace(/"/g, '""');
            const anio = e.AÑO || "";
            const vistaRapida = (e.CARATULA || "").replace(/"/g, '""');
            const estudioLinks = (e.PDF || "").replace(/"/g, '""');
            
            csv += `"${id}","${tituloLimpio}","${anio}","${vistaRapida}","${estudioLinks}"\n`;
        });

        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "BiVAS_Export_Estudios.csv";
        link.click();
    });

    cargarDatos();
});