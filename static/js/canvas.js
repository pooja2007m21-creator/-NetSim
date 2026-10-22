/**
 * NetSim Interactive SVG Canvas Renderer
 * Renders network devices, cables, pan/zoom viewports, drag interactions, and animations.
 */

class NetworkCanvas {
  constructor(svgElement, topologyManager) {
    this.svg = svgElement;
    this.tm = topologyManager;

    // Viewport transform (pan and zoom)
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.3;
    this.maxZoom = 2.5;

    // Dragging state
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    this.draggingDeviceId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.hasMovedDuringDrag = false;

    // Active path highlights
    this.highlightedPathNodeIds = new Set();
    this.highlightedConnectionIds = new Set();
    this.unreachableNodeIds = new Set();

    // Layers
    this.initSvgLayers();
    this.bindEvents();

    // Subscribe to topology model changes
    this.tm.subscribe((manager, changeType) => {
      this.render();
    });
  }

  initSvgLayers() {
    this.svg.innerHTML = `
      <defs>
        <pattern id="canvas-grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#334155" opacity="0.6" />
        </pattern>
        <filter id="glow-highlight" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect id="bg-grid-rect" width="10000" height="10000" x="-5000" y="-5000" fill="url(#canvas-grid)" pointer-events="all" />
      <g id="viewport-group">
        <g id="connections-layer"></g>
        <g id="devices-layer"></g>
        <g id="overlay-layer"></g>
      </g>
    `;

    this.viewport = this.svg.querySelector("#viewport-group");
    this.connectionsLayer = this.svg.querySelector("#connections-layer");
    this.devicesLayer = this.svg.querySelector("#devices-layer");
    this.updateViewportTransform();
  }

  updateViewportTransform() {
    this.viewport.setAttribute(
      "transform",
      `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`
    );
    const zoomText = document.getElementById("zoom-level-label");
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  screenToSvgCoords(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.zoom;
    const y = (clientY - rect.top - this.panY) / this.zoom;
    return { x, y };
  }

  bindEvents() {
    // Canvas Pan & Zoom Mouse Events
    this.svg.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));

    // Mouse wheel zoom
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAtPoint(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // Touch Support for Mobile / Tablets
    this.svg.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener("touchend", (e) => this.onTouchEnd(e));
  }

  zoomAtPoint(factor, clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    if (newZoom === this.zoom) return;

    // Adjust pan so mouse point remains stationary
    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.updateViewportTransform();
  }

  setZoom(newZoom) {
    const rect = this.svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const factor = newZoom / this.zoom;
    this.zoomAtPoint(factor, rect.left + centerX, rect.top + centerY);
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.updateViewportTransform();
  }

  fitToView() {
    if (this.tm.devices.length === 0) {
      this.resetZoom();
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const d of this.tm.devices) {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    }

    const padding = 100;
    const boundsWidth = (maxX - minX) + padding * 2;
    const boundsHeight = (maxY - minY) + padding * 2;
    const rect = this.svg.getBoundingClientRect();

    const scaleX = rect.width / boundsWidth;
    const scaleY = rect.height / boundsHeight;
    const targetZoom = Math.max(this.minZoom, Math.min(1.2, Math.min(scaleX, scaleY)));

    this.zoom = targetZoom;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.panX = (rect.width / 2) - (centerX * targetZoom);
    this.panY = (rect.height / 2) - (centerY * targetZoom);

    this.updateViewportTransform();
  }

  onMouseDown(e) {
    if (e.button !== 0) return; // Left click only

    const targetNode = e.target.closest(".device-node");
    const targetEdge = e.target.closest(".network-edge");

    if (targetNode) {
      const devId = targetNode.dataset.deviceId;
      this.handleDeviceClick(devId, e);
    } else if (targetEdge) {
      const connId = targetEdge.dataset.connectionId;
      this.handleConnectionClick(connId);
    } else {
      // Clicked on empty canvas
      if (this.tm.activeTool === "connect") {
        // Cancel pending connection source
        this.tm.sourceConnectingDeviceId = null;
        this.updateConnectingIndicator();
      }
      this.tm.clearSelection();
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      this.render();
    }
  }

  handleDeviceClick(devId, e) {
    if (this.tm.activeTool === "connect") {
      if (!this.tm.sourceConnectingDeviceId) {
        // Step 1: select source device
        this.tm.sourceConnectingDeviceId = devId;
        this.updateConnectingIndicator();
        this.render();
      } else {
        // Step 2: select destination device and connect
        const srcId = this.tm.sourceConnectingDeviceId;
        if (srcId === devId) {
          window.App.showToast("Cannot connect a device to itself.", "warning");
          this.tm.sourceConnectingDeviceId = null;
        } else {
          try {
            this.tm.addConnection(srcId, devId);
            window.App.showToast("Connection created successfully!", "success");
            this.tm.sourceConnectingDeviceId = null;
          } catch (err) {
            window.App.showToast(err.message, "error");
            this.tm.sourceConnectingDeviceId = null;
          }
        }
        this.updateConnectingIndicator();
      }
      return;
    }

    if (this.tm.activeTool === "delete") {
      this.tm.deleteDevice(devId);
      window.App.showToast("Device deleted.", "warning");
      return;
    }

    // Select Tool: Start dragging and select device
    this.tm.selectDevice(devId);
    this.draggingDeviceId = devId;
    this.hasMovedDuringDrag = false;

    const coords = this.screenToSvgCoords(e.clientX, e.clientY);
    const dev = this.tm.devices.find(d => d.id === devId);
    if (dev) {
      this.dragOffset = { x: coords.x - dev.x, y: coords.y - dev.y };
    }
    this.render();
  }

  handleConnectionClick(connId) {
    if (this.tm.activeTool === "delete") {
      this.tm.deleteConnection(connId);
      window.App.showToast("Connection removed.", "warning");
      return;
    }
    this.tm.selectConnection(connId);
    this.render();
  }

  onMouseMove(e) {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStart.x;
      this.panY = e.clientY - this.panStart.y;
      this.updateViewportTransform();
      return;
    }

    if (this.draggingDeviceId) {
      const coords = this.screenToSvgCoords(e.clientX, e.clientY);
      const newX = coords.x - this.dragOffset.x;
      const newY = coords.y - this.dragOffset.y;
      this.hasMovedDuringDrag = true;
      this.tm.moveDevice(this.draggingDeviceId, newX, newY, false);
      // Fast endpoint update without full re-render
      this.updateLiveEndpoints(this.draggingDeviceId, newX, newY);
    }
  }

  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
    }

    if (this.draggingDeviceId) {
      if (this.hasMovedDuringDrag) {
        // Record final position in snapshot
        this.tm.saveSnapshot();
      }
      this.draggingDeviceId = null;
      this.render();
    }
  }

  // Touch event handlers
  onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const fakeEvent = {
        button: 0,
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: document.elementFromPoint(touch.clientX, touch.clientY),
      };
      this.onMouseDown(fakeEvent);
    }
  }

  onTouchMove(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
      this.onMouseMove(fakeEvent);
    }
  }

  onTouchEnd(e) {
    this.onMouseUp(e);
  }

  updateConnectingIndicator() {
    const banner = document.getElementById("mode-indicator");
    if (!banner) return;

    if (this.tm.activeTool === "connect") {
      banner.classList.add("visible");
      if (this.tm.sourceConnectingDeviceId) {
        const srcDev = this.tm.devices.find(d => d.id === this.tm.sourceConnectingDeviceId);
        banner.innerHTML = `<span class="mode-badge connect">Connect Cable</span> Click target device to link with <strong>${srcDev ? srcDev.name : ""}</strong>`;
      } else {
        banner.innerHTML = `<span class="mode-badge connect">Connect Cable</span> Click first device, then second device to link`;
      }
    } else {
      banner.classList.remove("visible");
    }
  }

  clearHighlights() {
    this.highlightedPathNodeIds.clear();
    this.highlightedConnectionIds.clear();
    this.unreachableNodeIds.clear();
    this.render();
  }

  setPathHighlight(pathNodeIds, connectionIds) {
    this.highlightedPathNodeIds = new Set(pathNodeIds);
    this.highlightedConnectionIds = new Set(connectionIds);
    this.unreachableNodeIds.clear();
    this.render();
  }

  setBfsHighlight(reachableIds, unreachableIds) {
    this.highlightedPathNodeIds = new Set(reachableIds);
    this.unreachableNodeIds = new Set(unreachableIds);
    this.highlightedConnectionIds.clear();
    this.render();
  }

  updateLiveEndpoints(movedDevId, newX, newY) {
    // Quickly move node element
    const nodeEl = this.devicesLayer.querySelector(`[data-device-id="${movedDevId}"]`);
    if (nodeEl) {
      nodeEl.setAttribute("transform", `translate(${Math.round(newX)}, ${Math.round(newY)})`);
    }

    // Update lines connected to this device
    for (const conn of this.tm.connections) {
      if (conn.from === movedDevId || conn.to === movedDevId) {
        const lineEl = this.connectionsLayer.querySelector(`[data-connection-id="${conn.id}"]`);
        if (lineEl) {
          if (conn.from === movedDevId) {
            lineEl.setAttribute("x1", Math.round(newX));
            lineEl.setAttribute("y1", Math.round(newY));
          }
          if (conn.to === movedDevId) {
            lineEl.setAttribute("x2", Math.round(newX));
            lineEl.setAttribute("y2", Math.round(newY));
          }
        }
      }
    }
  }

  /**
   * Main render method for network topology.
   */
  render() {
    this.renderConnections();
    this.renderDevices();
    this.updateEmptyState();
  }

  updateEmptyState() {
    const emptyOverlay = document.getElementById("canvas-empty-state");
    if (!emptyOverlay) return;

    if (this.tm.devices.length === 0) {
      emptyOverlay.classList.remove("hidden");
    } else {
      emptyOverlay.classList.add("hidden");
    }
  }

  renderConnections() {
    const deviceMap = new Map(this.tm.devices.map(d => [d.id, d]));
    let html = "";

    for (const conn of this.tm.connections) {
      const u = deviceMap.get(conn.from);
      const v = deviceMap.get(conn.to);
      if (!u || !v) continue;

      const isSelected = this.tm.selectedConnectionId === conn.id;
      const isPathHighlight = this.highlightedConnectionIds.has(conn.id);

      let classes = "network-edge";
      if (isSelected) classes += " selected";
      if (isPathHighlight) classes += " path-highlight";

      html += `
        <line
          class="${classes}"
          data-connection-id="${conn.id}"
          x1="${u.x}"
          y1="${u.y}"
          x2="${v.x}"
          y2="${v.y}"
        />
      `;
    }

    this.connectionsLayer.innerHTML = html;
  }

  renderDevices() {
    let html = "";

    for (const dev of this.tm.devices) {
      const isSelected = this.tm.selectedDeviceId === dev.id;
      const isSourceConnecting = this.tm.sourceConnectingDeviceId === dev.id;
      const isPath = this.highlightedPathNodeIds.has(dev.id);
      const isUnreachable = this.unreachableNodeIds.has(dev.id);

      let classes = "device-node";
      if (isSelected) classes += " selected";
      if (isSourceConnecting) classes += " source-connecting";
      if (isPath) classes += " path-node";
      if (isUnreachable) classes += " unreachable-node";

      const iconSvg = this.getDeviceSvgIcon(dev.type);

      html += `
        <g class="${classes}" data-device-id="${dev.id}" transform="translate(${dev.x}, ${dev.y})">
          <!-- Card Background Box -->
          <rect class="node-card-bg" x="-36" y="-36" width="72" height="72" />
          
          <!-- Embedded Device Icon -->
          <g transform="translate(-16, -26)">
            ${iconSvg}
          </g>
          
          <!-- Device Name Label -->
          <text class="node-label" x="0" y="20">${this.escapeHtml(dev.name)}</text>
          
          <!-- Device Type Sub-Label -->
          <text class="node-type-label" x="0" y="30">${dev.type}</text>
        </g>
      `;
    }

    this.devicesLayer.innerHTML = html;
  }

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Generates crisp, educational SVG icons for Computer, Switch, and Router.
   */
  getDeviceSvgIcon(type) {
    switch (type) {
      case "Computer":
        // Desktop PC workstation: Screen, Stand, Base
        return `
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" fill="#064e3b" fill-opacity="0.5"/>
            <line x1="8" y1="21" x2="16" y2="21" stroke="#10b981"/>
            <line x1="12" y1="17" x2="12" y2="21" stroke="#10b981"/>
            <circle cx="12" cy="10" r="1.5" fill="#34d399"/>
          </svg>
        `;

      case "Switch":
        // Layer 2 Ethernet Switch with multi-port bidirectional arrows
        return `
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" fill="#083344" fill-opacity="0.6"/>
            <!-- Switch port arrows -->
            <polyline points="7 10 9 8 11 10"/>
            <polyline points="17 14 15 16 13 14"/>
            <line x1="9" y1="8" x2="9" y2="15"/>
            <line x1="15" y1="9" x2="15" y2="16"/>
            <!-- Port LEDs -->
            <circle cx="5" cy="8" r="1" fill="#22d3ee"/>
            <circle cx="5" cy="12" r="1" fill="#22d3ee"/>
            <circle cx="5" cy="16" r="1" fill="#22d3ee"/>
          </svg>
        `;

      case "Router":
        // Layer 3 IP Router: Cisco cylindrical disc with cross 4-way arrows
        return `
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" fill="#3b0764" fill-opacity="0.6"/>
            <!-- 4 Cross Directional Arrows -->
            <line x1="12" y1="7" x2="12" y2="11"/>
            <line x1="12" y1="13" x2="12" y2="17"/>
            <line x1="7" y1="12" x2="11" y2="12"/>
            <line x1="13" y1="12" x2="17" y2="12"/>
            <polyline points="10 9 12 7 14 9"/>
            <polyline points="10 15 12 17 14 15"/>
            <polyline points="9 10 7 12 9 14"/>
            <polyline points="15 10 17 12 15 14"/>
          </svg>
        `;

      default:
        return `
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
            <circle cx="12" cy="12" r="8"/>
          </svg>
        `;
    }
  }
}

window.NetworkCanvas = NetworkCanvas;
