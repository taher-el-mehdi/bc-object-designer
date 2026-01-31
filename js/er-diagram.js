// ER Diagram module: builds a simple relationship graph from parsed AL tables
// and renders an interactive SVG with zoom/pan.

/**
 * Parse a TableRelation string to extract target table name and field mappings.
 * Supports common forms like:
 *  - Customer
 *  - "Customer"
 *  - Record Customer
 *  - Customer WHERE("No." = FIELD("Sell-to Customer No."))
 *  - "Customer" where(No = field("Cust No"))
 * Returns { targetName: string, mappings: Array<{target:string, source:string}> }
 */
export function parseTableRelation(rel) {
    const s = String(rel || '').trim();
    if (!s) return { targetName: '', mappings: [] };
    const nameMatch = s.match(/^(?:record\s+)?(?:"([^"]+)"|([A-Za-z0-9_]+))/i);
    const targetName = nameMatch ? (nameMatch[1] || nameMatch[2] || '') : '';
    const maps = [];
    const whereMatch = s.match(/where\s*\((.*)\)/i);
    if (whereMatch) {
        const inner = whereMatch[1];
        // Find pairs like: "Target" = FIELD("Source") or Target = FIELD(Source)
        const pairRegex = /(?:"([^"]+)"|([A-Za-z0-9_\.]+))\s*=\s*field\s*\((?:"([^"]+)"|([A-Za-z0-9_\.]+))\)/gi;
        let m;
        while ((m = pairRegex.exec(inner))) {
            const target = m[1] || m[2] || '';
            const source = m[3] || m[4] || '';
            if (target || source) maps.push({ target, source });
        }
    }
    return { targetName, mappings: maps };
}
/** Build relation graph centered on selected table */
export function buildRelationGraph(selectedTable, allObjects) {
    const graph = { nodes: [], edges: [], centerName: '' };
    if (!selectedTable || !Array.isArray(allObjects)) return graph;
    const tableObjs = allObjects.filter(o => String(o.type) === 'Table');
    const byName = new Map();
    for (const t of tableObjs) { byName.set(String(t.name || '').replace(/"/g, '').toLowerCase(), t); }

    function nodeFor(table) {
        // Primary Key
        const keys = Array.isArray(table.keys) ? table.keys : [];
        const pk = (keys[0] && Array.isArray(keys[0].fields))
            ? keys[0].fields.map(f => typeof f === 'string' ? f : f.name)
            : [];

        // Normalize fields (handle different parser shapes)
        let rawFields = [];

        if (Array.isArray(table.fields)) {
            rawFields = table.fields;
        }
        else if (table.fields && Array.isArray(table.fields.fields)) {
            rawFields = table.fields.fields;
        }

        const fields = rawFields.map(f => ({
            name: f.name || f.fieldName || '',
            type: f.type || f.dataType || '',
            flowfield: !!f.flowfield || !!f.isFlowField
        })).filter(f => f.name);

        return {
            id: table.id,
            name: String(table.name || ''),
            keys: pk,
            fields
        };
    }


    const center = nodeFor(selectedTable);
    graph.nodes.push(center);
    graph.centerName = center.name;

    const relatedMap = new Map();
    for (const f of (selectedTable.fields || [])) {
        if (!f.relation) continue;
        const info = parseTableRelation(f.relation);
        const targetKey = String(info.targetName || '').replace(/"/g, '').toLowerCase();
        if (!targetKey) continue;
        const targetTable = byName.get(targetKey);
        if (!targetTable) continue;
        if (!relatedMap.has(targetKey)) {
            const node = nodeFor(targetTable);
            graph.nodes.push(node);
            relatedMap.set(targetKey, node);
        }
        graph.edges.push({ from: center.name, to: targetTable.name, viaField: f.name, mappings: info.mappings });
    }
    return graph;
}

/** Render the ER graph into a container as interactive SVG. */
export function renderERDiagram(containerEl, graph) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const width = containerEl.clientWidth || 800;
    const height = containerEl.clientHeight || 500;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.background = 'var(--surface)';

    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    const marker = document.createElementNS(svg.namespaceURI, 'marker');
    marker.setAttribute('id', 'arrow');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const arrPath = document.createElementNS(svg.namespaceURI, 'path');
    arrPath.setAttribute('d', 'M0,0 L10,3 L0,6 Z');
    arrPath.setAttribute('fill', 'var(--muted)');
    marker.appendChild(arrPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const world = document.createElementNS(svg.namespaceURI, 'g');
    svg.appendChild(world);

    // Zoom and pan state
    let scale = 1;
    let tx = 0, ty = 0;
    function updateTransform() { world.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`); }
    updateTransform();

    // Layout: center + radial related nodes
    const cx = width / 2, cy = height / 2;
    const positions = new Map();
    const sizes = new Map();
    function computeNodeSize(node) {
        const baseH = 40;
        const maxFields = 30;
        const h = baseH + Math.min(maxFields, (node.fields || []).length) * 14;
        return { w: 220, h };
    }

    if (graph.centerName) {
        const centerNode = graph.nodes[0];
        const centerSize = computeNodeSize(centerNode);
        sizes.set(centerNode.name, centerSize);
        positions.set(centerNode.name, { x: cx - centerSize.w / 2, y: cy - centerSize.h / 2 });
        const related = graph.nodes.slice(1);
        const R = Math.min(width, height) / 2 - 160;
        const angleStep = related.length ? (2 * Math.PI) / related.length : 0;
        for (let i = 0; i < related.length; i++) {
            const node = related[i];
            const sz = computeNodeSize(node);
            sizes.set(node.name, sz);
            const a = i * angleStep;
            const rx = cx + R * Math.cos(a) - sz.w / 2;
            const ry = cy + R * Math.sin(a) - sz.h / 2;
            positions.set(node.name, { x: rx, y: ry });
        }
    } else {
        // Grid layout for global graph
        const n = graph.nodes.length;
        const cols = Math.max(3, Math.ceil(Math.sqrt(n)));
        const padX = 40, padY = 40;
        const cellW = 260, cellH = 200;
        for (let i = 0; i < n; i++) {
            const node = graph.nodes[i];
            const sz = computeNodeSize(node);
            sizes.set(node.name, sz);
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = padX + col * cellW;
            const y = padY + row * cellH;
            positions.set(node.name, { x, y });
        }
    }

    function drawEntity(node) {
        const pos = positions.get(node.name);
        const nodeSize = sizes.get(node.name) || { w: 220, h: 80 };
        const g = document.createElementNS(svg.namespaceURI, 'g');
        g.setAttribute('class', 'er-entity');
        g.setAttribute('cursor', 'pointer');

        const rect = document.createElementNS(svg.namespaceURI, 'rect');
        rect.setAttribute('x', String(pos.x)); rect.setAttribute('y', String(pos.y));
        rect.setAttribute('width', String(nodeSize.w)); rect.setAttribute('height', String(nodeSize.h));
        rect.setAttribute('rx', '8'); rect.setAttribute('ry', '8');
        rect.setAttribute('fill', 'var(--hover)');
        rect.setAttribute('stroke', 'var(--border)');
        rect.setAttribute('stroke-width', '1');

        const title = document.createElementNS(svg.namespaceURI, 'title');
        title.textContent = `${node.name}${node.keys ? `\nPK: ${node.keys.join(', ')}` : ''}`;
        rect.appendChild(title);

        const nameText = document.createElementNS(svg.namespaceURI, 'text');
        nameText.setAttribute('x', String(pos.x + 12));
        nameText.setAttribute('y', String(pos.y + 22));
        nameText.setAttribute('fill', 'var(--text)');
        nameText.setAttribute('font-size', '14');
        nameText.setAttribute('font-weight', '700');
        nameText.textContent = node.name;

        let yCursor = pos.y + 42;
        const pkLine = document.createElementNS(svg.namespaceURI, 'text');
        pkLine.setAttribute('x', String(pos.x + 12));
        pkLine.setAttribute('y', String(yCursor));
        pkLine.setAttribute('fill', 'var(--muted)');
        pkLine.setAttribute('font-size', '12');
        pkLine.textContent = node.keys && node.keys.length ? `PK: ${node.keys.join(', ')}` : '';
        yCursor += 18;

        // Fields list (truncate)
        const maxFields = 12;
        const fieldsToShow = (node.fields || []).slice(0, maxFields);
        for (const f of fieldsToShow) {
            const line = document.createElementNS(svg.namespaceURI, 'text');
            line.setAttribute('x', String(pos.x + 12));
            line.setAttribute('y', String(yCursor));
            line.setAttribute('fill', 'var(--text)');
            line.setAttribute('font-size', '12');
            const typeText = f.type ? `: ${f.type}` : '';
            const ffText = f.flowfield ? ' (FlowField)' : '';
            line.textContent = `• ${f.name}${typeText}${ffText}`;
            g.appendChild(line);
            yCursor += 16;
        }
        const remaining = (node.fields || []).length - fieldsToShow.length;
        if (remaining > 0) {
            const more = document.createElementNS(svg.namespaceURI, 'text');
            more.setAttribute('x', String(pos.x + 12));
            more.setAttribute('y', String(yCursor));
            more.setAttribute('fill', 'var(--muted)');
            more.setAttribute('font-size', '12');
            more.textContent = `… +${remaining} more`;
            g.appendChild(more);
        }

        g.appendChild(rect);
        g.appendChild(nameText);
        g.appendChild(pkLine);
        world.appendChild(g);
    }

    function drawEdge(edge) {
        const p1 = positions.get(edge.from);
        const p2 = positions.get(edge.to);
        if (!p1 || !p2) return;
        const s1 = sizes.get(edge.from) || { w: 220, h: 80 };
        const s2 = sizes.get(edge.to) || { w: 220, h: 80 };
        const x1 = p1.x + s1.w / 2, y1 = p1.y + s1.h / 2;
        const x2 = p2.x + s2.w / 2, y2 = p2.y + s2.h / 2;

        const line = document.createElementNS(svg.namespaceURI, 'line');
        line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
        line.setAttribute('stroke', 'var(--muted)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('marker-end', 'url(#arrow)');

        const label = document.createElementNS(svg.namespaceURI, 'text');
        const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
        label.setAttribute('x', String(mx + 6)); label.setAttribute('y', String(my - 6));
        label.setAttribute('fill', 'var(--muted)'); label.setAttribute('font-size', '12');
        const mapText = (edge.mappings && edge.mappings.length)
            ? edge.mappings.map(m => `${m.source}→${m.target}`).join(', ')
            : edge.viaField || '';
        label.textContent = mapText;

        world.appendChild(line);
        world.appendChild(label);
    }

    // Draw
    for (const n of graph.nodes) {
        console.log(n);
        drawEntity(n);
    }
    for (const e of graph.edges) drawEdge(e);

    // Interactions: zoom (wheel) and pan (drag)
    svg.addEventListener('wheel', (evt) => {
        evt.preventDefault();
        const delta = Math.sign(evt.deltaY);
        const factor = delta > 0 ? 0.9 : 1.1;
        scale = Math.max(0.4, Math.min(2.5, scale * factor));
        updateTransform();
    }, { passive: false });

    let dragging = false, sx = 0, sy = 0;
    svg.addEventListener('mousedown', (evt) => { dragging = true; sx = evt.clientX; sy = evt.clientY; svg.style.cursor = 'move'; });
    window.addEventListener('mousemove', (evt) => {
        if (!dragging) return;
        const dx = evt.clientX - sx; const dy = evt.clientY - sy;
        sx = evt.clientX; sy = evt.clientY;
        tx += dx; ty += dy; updateTransform();
    });
    window.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'default'; });

    containerEl.appendChild(svg);
}

/** Convenience orchestration: build and render */
export function showERDiagram(selectedTable, allObjects, containerEl) {
    const graph = buildRelationGraph(selectedTable, allObjects);
    renderERDiagram(containerEl, graph);
}

/** Build a global relations graph across all tables */
export function buildGlobalRelationGraph(allObjects) {
    const graph = { nodes: [], edges: [], centerName: '' };
    const tables = (allObjects || []).filter(o => String(o.type) === 'Table');
    
    const byName = new Map();
    for (const t of tables) { byName.set(String(t.name || '').replace(/"/g, '').toLowerCase(), t); }
    function nodeFor(table) {
        // Primary Key
        const keys = Array.isArray(table.keys) ? table.keys : [];
        const pk = (keys[0] && Array.isArray(keys[0].fields))
            ? keys[0].fields.map(f => typeof f === 'string' ? f : f.name)
            : [];

        // Normalize fields (handle different parser shapes)
        let rawFields = [];

        if (Array.isArray(table.fields)) {
            rawFields = table.fields;
        }
        else if (table.fields && Array.isArray(table.fields.fields)) {
            rawFields = table.fields.fields;
        }

        const fields = rawFields.map(f => ({
            name: f.name || f.fieldName || '',
            type: f.type || f.dataType || '',
            flowfield: !!f.flowfield || !!f.isFlowField
        })).filter(f => f.name);

        return {
            id: table.id,
            name: String(table.name || ''),
            keys: pk,
            fields
        };
    }
    for (const t of tables) { 
     graph.nodes.push(nodeFor(t)); }
    // Relations
    for (const t of tables) {
        const srcName = String(t.name || '');
        for (const f of (t.fields || [])) {
            if (!f.relation) continue;
            const info = parseTableRelation(f.relation);
            const targetKey = String(info.targetName || '').replace(/"/g, '').toLowerCase();
            if (!targetKey) continue;
            const targetT = byName.get(targetKey);
            if (!targetT) continue;
            graph.edges.push({ from: srcName, to: targetT.name, viaField: f.name, mappings: info.mappings });
        }
    }
    return graph;
}

export function showERDiagramAll(allObjects, containerEl) {
    const graph = buildGlobalRelationGraph(allObjects);
    renderERDiagram(containerEl, graph);
}
