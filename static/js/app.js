/**
 * NetSim Main Application Controller
 * Wires UI controls, modals, tabs, inspector, REST API synchronization, and educational panels.
 */

class NetSimApp {
  constructor() {
    this.tm = new TopologyManager();
    const svgEl = document.getElementById("network-svg");
    this.canvas = new NetworkCanvas(svgEl, this.tm);

    this.currentSavedId = null;
    this.activityLog = [];

    this.initUi();
    this.initKeyboardShortcuts();
    this.startHealthPolling();

    // Load initial default preset (Star Topology)
    const rect = svgEl.getBoundingClientRect();
    this.tm.generatePreset("star", rect.width || 800, rect.height || 600);
    this.logActivity("Initialized NetSim workspace with default Star Topology.", "info");
    this.updateStatsAndInspector();
  }

  initUi() {
    // Mode Tools (Select, Connect, Delete)
    const toolSelect = document.getElementById("tool-select");
    const toolConnect = document.getElementById("tool-connect");
    const toolDelete = document.getElementById("tool-delete");

    toolSelect.addEventListener("click", () => this.setActiveTool("select"));
    toolConnect.addEventListener("click", () => this.setActiveTool("connect"));
    toolDelete.addEventListener("click", () => this.setActiveTool("delete"));

    // Add Device Buttons
    document.getElementById("btn-add-pc").addEventListener("click", () => this.addNewDevice("Computer"));
    document.getElementById("btn-add-switch").addEventListener("click", () => this.addNewDevice("Switch"));
    document.getElementById("btn-add-router").addEventListener("click", () => this.addNewDevice("Router"));

    // Quick Add from Empty State
    const emptyBtnPC = document.getElementById("empty-add-pc");
    if (emptyBtnPC) emptyBtnPC.addEventListener("click", () => this.addNewDevice("Computer"));
    const emptyBtnStar = document.getElementById("empty-load-star");
    if (emptyBtnStar) emptyBtnStar.addEventListener("click", () => this.loadPreset("star"));

    // History Buttons (Undo / Redo)
    document.getElementById("btn-undo").addEventListener("click", () => {
      if (this.tm.undo()) {
        this.logActivity("Performed Undo.", "info");
        this.showToast("Action undone.", "info");
      }
    });

    document.getElementById("btn-redo").addEventListener("click", () => {
      if (this.tm.redo()) {
        this.logActivity("Performed Redo.", "info");
        this.showToast("Action redone.", "info");
      }
    });

    // Preset Buttons
    document.querySelectorAll(".btn-preset").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const preset = e.target.dataset.preset;
        this.loadPreset(preset);
      });
    });

    // Storage Actions (Save, Load, Export, Import, Clear)
    document.getElementById("btn-open-save-modal").addEventListener("click", () => this.openSaveModal());
    document.getElementById("btn-open-load-modal").addEventListener("click", () => this.openLoadModal());
    document.getElementById("btn-export-json").addEventListener("click", () => this.exportCurrentTopology());
    document.getElementById("btn-import-json").addEventListener("click", () => document.getElementById("file-import-input").click());
    document.getElementById("file-import-input").addEventListener("change", (e) => this.handleFileImport(e));
    document.getElementById("btn-clear-canvas").addEventListener("click", () => this.openClearModal());

    // Zoom Controls
    document.getElementById("btn-zoom-in").addEventListener("click", () => this.canvas.zoomAtPoint(1.2, window.innerWidth / 2, window.innerHeight / 2));
    document.getElementById("btn-zoom-out").addEventListener("click", () => this.canvas.zoomAtPoint(0.8, window.innerWidth / 2, window.innerHeight / 2));
    document.getElementById("btn-zoom-reset").addEventListener("click", () => this.canvas.resetZoom());
    document.getElementById("btn-zoom-fit").addEventListener("click", () => this.canvas.fitToView());

    // Inspector Tabs Navigation
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const tabId = e.target.dataset.tab;
        this.switchTab(tabId);
      });
    });

    // Modal Close Buttons
    document.querySelectorAll(".modal-close-btn, .btn-modal-cancel").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal-backdrop");
        if (modal) modal.classList.remove("open");
      });
    });

    // Save Modal Submit
    document.getElementById("btn-save-confirm").addEventListener("click", () => this.confirmSaveTopology());

    // Clear Modal Confirm
    document.getElementById("btn-clear-confirm").addEventListener("click", () => {
      this.tm.clearTopology();
      this.canvas.clearHighlights();
      this.currentSavedId = null;
      document.getElementById("modal-clear").classList.remove("open");
      this.logActivity("Canvas cleared.", "warning");
      this.showToast("Canvas has been cleared.", "warning");
    });

    // Help / About Modal
    document.getElementById("btn-open-help").addEventListener("click", () => {
      document.getElementById("modal-help").classList.add("open");
    });

    // Shortest Path Button
    document.getElementById("btn-run-shortest-path").addEventListener("click", () => this.runShortestPathAnalysis());
    document.getElementById("btn-clear-path-highlight").addEventListener("click", () => {
      this.canvas.clearHighlights();
      document.getElementById("path-results-box").style.display = "none";
      this.showToast("Path highlights cleared.", "info");
    });

    // BFS Traversal Button
    document.getElementById("btn-run-bfs").addEventListener("click", () => this.runBfsAnalysis());

    // Educational Accordions
    document.querySelectorAll(".theory-header").forEach(header => {
      header.addEventListener("click", () => {
        const body = header.nextElementSibling;
        if (body) {
          body.classList.toggle("open");
        }
      });
    });

    // Update listeners when topology changes
    this.tm.subscribe((manager, changeType) => {
      this.updateHistoryButtons();
      this.updateStatsAndInspector();
      if (changeType === "addDevice") {
        this.logActivity(`Added device ${this.tm.devices[this.tm.devices.length - 1].name}`, "info");
      } else if (changeType === "addConnection") {
        const conn = this.tm.connections[this.tm.connections.length - 1];
        const u = this.tm.devices.find(d => d.id === conn.from);
        const v = this.tm.devices.find(d => d.id === conn.to);
        this.logActivity(`Created link: ${u ? u.name : conn.from} ↔ ${v ? v.name : conn.to}`, "success");
      }
    });

    this.updateHistoryButtons();
  }

  setActiveTool(toolName) {
    this.tm.activeTool = toolName;
    this.tm.sourceConnectingDeviceId = null;

    document.querySelectorAll(".btn-tool").forEach(b => b.classList.remove("active"));
    const activeBtn = document.getElementById(`tool-${toolName}`);
    if (activeBtn) activeBtn.classList.add("active");

    const svg = document.getElementById("network-svg");
    if (toolName === "connect") {
      svg.classList.add("connecting-mode");
    } else {
      svg.classList.remove("connecting-mode");
    }

    this.canvas.updateConnectingIndicator();
    this.canvas.render();
  }

  addNewDevice(type) {
    // Generate spawn position in visible viewport area with slight jitter
    const rect = this.canvas.svg.getBoundingClientRect();
    const center = this.canvas.screenToSvgCoords(
      rect.left + rect.width / 2 + (Math.random() - 0.5) * 120,
      rect.top + rect.height / 2 + (Math.random() - 0.5) * 120
    );

    try {
      this.tm.addDevice(type, center.x, center.y);
      this.showToast(`Added new ${type}.`, "success");
    } catch (err) {
      this.showToast(err.message, "error");
    }
  }

  loadPreset(preset) {
    const rect = this.canvas.svg.getBoundingClientRect();
    this.tm.generatePreset(preset, rect.width || 800, rect.height || 600);
    this.canvas.clearHighlights();
    this.canvas.fitToView();
    this.logActivity(`Loaded ${preset.toUpperCase()} Topology preset.`, "info");
    this.showToast(`Loaded ${preset.toUpperCase()} topology.`, "success");
  }

  updateHistoryButtons() {
    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    if (undoBtn) undoBtn.disabled = !this.tm.canUndo();
    if (redoBtn) redoBtn.disabled = !this.tm.canRedo();
  }

  switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const content = document.getElementById(`tab-content-${tabId}`);

    if (btn) btn.classList.add("active");
    if (content) content.classList.add("active");
  }

  updateStatsAndInspector() {
    this.renderInspector();
    this.updateDropdowns();
    this.fetchTopologySummary();
  }

  renderInspector() {
    const devCard = document.getElementById("selected-device-card");
    const connCard = document.getElementById("selected-connection-card");
    const emptyInspector = document.getElementById("inspector-empty-state");

    if (this.tm.selectedDeviceId) {
      const dev = this.tm.devices.find(d => d.id === this.tm.selectedDeviceId);
      if (dev) {
        emptyInspector.style.display = "none";
        connCard.style.display = "none";
        devCard.style.display = "block";

        document.getElementById("insp-device-name-input").value = dev.name;
        document.getElementById("insp-device-type").textContent = dev.type;
        document.getElementById("insp-device-coords").textContent = `(${dev.x}, ${dev.y})`;

        // Neighbors and degree
        const neighbors = this.tm.connections
          .filter(c => c.from === dev.id || c.to === dev.id)
          .map(c => {
            const neighborId = c.from === dev.id ? c.to : c.from;
            const nDev = this.tm.devices.find(d => d.id === neighborId);
            return nDev ? nDev.name : neighborId;
          });

        document.getElementById("insp-device-degree").textContent = neighbors.length;
        document.getElementById("insp-device-neighbors").textContent =
          neighbors.length > 0 ? neighbors.join(", ") : "None (Isolated)";

        // Wire device rename
        const renameBtn = document.getElementById("btn-insp-rename");
        renameBtn.onclick = () => {
          const newName = document.getElementById("insp-device-name-input").value;
          try {
            this.tm.renameDevice(dev.id, newName);
            this.showToast(`Renamed device to "${newName}".`, "success");
          } catch (err) {
            this.showToast(err.message, "error");
          }
        };

        // Wire device delete
        const deleteBtn = document.getElementById("btn-insp-delete-device");
        deleteBtn.onclick = () => {
          this.tm.deleteDevice(dev.id);
          this.showToast(`Deleted ${dev.name}.`, "warning");
        };

        return;
      }
    }

    if (this.tm.selectedConnectionId) {
      const conn = this.tm.connections.find(c => c.id === this.tm.selectedConnectionId);
      if (conn) {
        emptyInspector.style.display = "none";
        devCard.style.display = "none";
        connCard.style.display = "block";

        const u = this.tm.devices.find(d => d.id === conn.from);
        const v = this.tm.devices.find(d => d.id === conn.to);

        document.getElementById("insp-conn-endpoints").textContent =
          `${u ? u.name : conn.from} ↔ ${v ? v.name : conn.to}`;
        document.getElementById("insp-conn-status").textContent = conn.status;

        // Wire delete connection
        const delConnBtn = document.getElementById("btn-insp-delete-conn");
        delConnBtn.onclick = () => {
          this.tm.deleteConnection(conn.id);
          this.showToast("Connection deleted.", "warning");
        };

        return;
      }
    }

    // Nothing selected
    emptyInspector.style.display = "block";
    devCard.style.display = "none";
    connCard.style.display = "none";
  }

  updateDropdowns() {
    const srcSelect = document.getElementById("shortest-src-select");
    const tgtSelect = document.getElementById("shortest-tgt-select");
    const bfsSelect = document.getElementById("bfs-start-select");

    const currentSrc = srcSelect.value;
    const currentTgt = tgtSelect.value;
    const currentBfs = bfsSelect.value;

    let optionsHtml = '<option value="">-- Choose Device --</option>';
    for (const dev of this.tm.devices) {
      optionsHtml += `<option value="${dev.id}">${this.canvas.escapeHtml(dev.name)} (${dev.type})</option>`;
    }

    srcSelect.innerHTML = optionsHtml;
    tgtSelect.innerHTML = optionsHtml;
    bfsSelect.innerHTML = optionsHtml;

    // Restore selections if valid
    if (this.tm.devices.some(d => d.id === currentSrc)) srcSelect.value = currentSrc;
    if (this.tm.devices.some(d => d.id === currentTgt)) tgtSelect.value = currentTgt;
    if (this.tm.devices.some(d => d.id === currentBfs)) bfsSelect.value = currentBfs;
  }

  async fetchTopologySummary() {
    try {
      const payload = this.tm.getPayload();
      const response = await API.getSummary(payload);
      if (response && response.success) {
        this.renderStatsCards(response.summary);
      }
    } catch (err) {
      console.warn("Failed to fetch topology summary from server:", err);
      // Fallback local calculations
      this.renderLocalStats();
    }
  }

  renderStatsCards(summary) {
    document.getElementById("stat-total-devices").textContent = summary.total_devices;
    document.getElementById("stat-device-breakdown").textContent =
      `${summary.computers} PCs, ${summary.switches} SW, ${summary.routers} R`;

    document.getElementById("stat-total-connections").textContent = summary.total_connections;
    document.getElementById("stat-components-count").textContent = summary.connectivity.component_count;

    // Connectivity Status Badge
    const badge = document.getElementById("stat-connectivity-badge");
    badge.textContent = summary.connectivity.status;
    badge.className = "badge-status";
    if (summary.connectivity.is_connected) {
      badge.classList.add("connected");
    } else if (summary.total_devices === 0) {
      badge.classList.add("empty");
    } else {
      badge.classList.add("disconnected");
    }

    // Density and Degree
    document.getElementById("stat-density").textContent = `${(summary.density * 100).toFixed(1)}%`;
    document.getElementById("stat-avg-degree").textContent = summary.average_degree;

    // Isolated Devices
    const isoCard = document.getElementById("stat-isolated-card");
    const isoText = document.getElementById("stat-isolated-list");
    if (summary.isolated_count > 0) {
      isoCard.style.display = "block";
      const names = summary.isolated_devices.map(d => d.name).join(", ");
      isoText.textContent = `${summary.isolated_count} isolated: ${names}`;
    } else {
      isoCard.style.display = "none";
    }

    // Insights List
    const insightsList = document.getElementById("stat-insights-list");
    if (insightsList && summary.insights) {
      insightsList.innerHTML = summary.insights.map(item => `<li>${this.canvas.escapeHtml(item)}</li>`).join("");
    }
  }

  renderLocalStats() {
    const v = this.tm.devices.length;
    const e = this.tm.connections.length;
    document.getElementById("stat-total-devices").textContent = v;
    document.getElementById("stat-total-connections").textContent = e;
  }

  async runShortestPathAnalysis() {
    const srcId = document.getElementById("shortest-src-select").value;
    const tgtId = document.getElementById("shortest-tgt-select").value;

    if (!srcId || !tgtId) {
      this.showToast("Please choose both a source and destination device.", "warning");
      return;
    }

    try {
      const payload = {
        ...this.tm.getPayload(),
        source_id: srcId,
        target_id: tgtId,
      };

      const res = await API.calculateShortestPath(payload);
      if (res && res.success) {
        const result = res.result;
        const resultBox = document.getElementById("path-results-box");
        resultBox.style.display = "block";

        if (result.found) {
          document.getElementById("path-status-text").innerHTML =
            `<strong style="color: var(--accent-emerald);">Path Found:</strong> ${result.hops} Hop(s)`;
          document.getElementById("path-route-text").textContent =
            result.path_devices.map(d => d.name).join(" → ");
          document.getElementById("path-explanation-text").textContent = result.explanation;

          // Highlight path on SVG canvas
          this.canvas.setPathHighlight(result.path_ids, result.connection_ids);
          this.logActivity(`Calculated shortest path (${result.hops} hops): ${result.path_ids.join(" → ")}`, "success");
          this.showToast(`Shortest path found (${result.hops} hops)!`, "success");
        } else {
          document.getElementById("path-status-text").innerHTML =
            `<strong style="color: var(--accent-rose);">No Route:</strong> Destination Unreachable`;
          document.getElementById("path-route-text").textContent = "N/A";
          document.getElementById("path-explanation-text").textContent = result.explanation;
          this.canvas.clearHighlights();
          this.logActivity(`No route between chosen devices.`, "warning");
          this.showToast("No path exists between selected devices.", "warning");
        }
      }
    } catch (err) {
      this.showToast(err.message, "error");
    }
  }

  async runBfsAnalysis() {
    const startId = document.getElementById("bfs-start-select").value;
    if (!startId) {
      this.showToast("Please select a starting host for BFS.", "warning");
      return;
    }

    try {
      const payload = {
        ...this.tm.getPayload(),
        start_device_id: startId,
      };

      const res = await API.analyzeConnectivity(payload);
      if (res && res.success && res.bfs) {
        const bfs = res.bfs;
        const resultBox = document.getElementById("bfs-results-box");
        resultBox.style.display = "block";

        const startName = bfs.start_device_name;
        document.getElementById("bfs-reachable-count").textContent =
          `${bfs.reachable_count} Reachable, ${bfs.unreachable_count} Unreachable`;

        document.getElementById("bfs-order-text").textContent =
          bfs.visited.map(id => {
            const dev = this.tm.devices.find(d => d.id === id);
            return `${dev ? dev.name : id} (hop ${bfs.distances[id]})`;
          }).join(" → ");

        // Highlight reachable in green, unreachable in red
        this.canvas.setBfsHighlight(bfs.visited, bfs.unreachable);
        this.logActivity(`BFS Traversal from ${startName}: ${bfs.reachable_count} nodes reached.`, "info");
        this.showToast(`BFS complete: ${bfs.reachable_count} nodes reachable.`, "success");
      }
    } catch (err) {
      this.showToast(err.message, "error");
    }
  }

  // Modals & Storage
  openSaveModal() {
    document.getElementById("save-topology-name").value = this.tm.name;
    document.getElementById("save-topology-desc").value = this.tm.description;
    document.getElementById("modal-save").classList.add("open");
  }

  async confirmSaveTopology() {
    const name = document.getElementById("save-topology-name").value.trim();
    const desc = document.getElementById("save-topology-desc").value.trim();

    if (!name) {
      this.showToast("Please provide a name for the topology.", "warning");
      return;
    }

    this.tm.name = name;
    this.tm.description = desc;

    try {
      const payload = this.tm.getPayload();
      let res;
      if (this.currentSavedId) {
        res = await API.updateTopology(this.currentSavedId, payload);
      } else {
        res = await API.saveTopology(payload);
        this.currentSavedId = res.id;
      }

      document.getElementById("modal-save").classList.remove("open");
      this.logActivity(`Saved topology "${name}" (ID: ${this.currentSavedId}) to SQLite.`, "success");
      this.showToast(`Topology "${name}" saved successfully!`, "success");
    } catch (err) {
      this.showToast(`Save failed: ${err.message}`, "error");
    }
  }

  async openLoadModal() {
    const modal = document.getElementById("modal-load");
    const container = document.getElementById("saved-topologies-list");
    container.innerHTML = `<div style="text-align: center; padding: 20px;">Loading saved topologies...</div>`;
    modal.classList.add("open");

    try {
      const res = await API.getTopologies();
      if (!res || !res.topologies || res.topologies.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">No saved topologies found in database. Create and save one!</div>`;
        return;
      }

      let html = `
        <table class="topologies-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Devices</th>
              <th>Links</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const top of res.topologies) {
        const dateStr = new Date(top.updated_at).toLocaleDateString([], {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });

        html += `
          <tr>
            <td>
              <strong>${this.canvas.escapeHtml(top.name)}</strong>
              ${top.description ? `<br><small style="color: var(--text-muted);">${this.canvas.escapeHtml(top.description)}</small>` : ""}
            </td>
            <td>${top.device_count}</td>
            <td>${top.connection_count}</td>
            <td><small>${dateStr}</small></td>
            <td>
              <button class="btn-action primary" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; width: auto; margin-right: 4px;" onclick="window.App.loadSavedTopology(${top.id})">Load</button>
              <button class="btn-action danger" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; width: auto;" onclick="window.App.deleteSavedTopology(${top.id})">Delete</button>
            </td>
          </tr>
        `;
      }

      html += `</tbody></table>`;
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 10px;">Failed to load saved topologies: ${err.message}</div>`;
    }
  }

  async loadSavedTopology(id) {
    try {
      const res = await API.getTopology(id);
      if (res && res.success && res.topology) {
        const top = res.topology;
        this.currentSavedId = top.id;
        this.tm.loadFromData({
          name: top.name,
          description: top.description,
          devices: top.topology_data.devices,
          connections: top.topology_data.connections,
        });

        document.getElementById("modal-load").classList.remove("open");
        this.canvas.clearHighlights();
        this.canvas.fitToView();
        this.logActivity(`Loaded saved topology "${top.name}" (ID: ${top.id}).`, "success");
        this.showToast(`Loaded "${top.name}".`, "success");
      }
    } catch (err) {
      this.showToast(`Load failed: ${err.message}`, "error");
    }
  }

  async deleteSavedTopology(id) {
    if (!confirm("Are you sure you want to delete this saved topology?")) return;

    try {
      await API.deleteTopology(id);
      if (this.currentSavedId === id) this.currentSavedId = null;
      this.showToast("Topology deleted from database.", "warning");
      this.openLoadModal(); // refresh table
    } catch (err) {
      this.showToast(`Delete failed: ${err.message}`, "error");
    }
  }

  exportCurrentTopology() {
    const payload = {
      schema_version: "1.0",
      generator: "NetSim - Computer Network Topology Simulator",
      exported_at: new Date().toISOString(),
      topology: this.tm.getPayload(),
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const safeName = (this.tm.name || "network_topology").toLowerCase().replace(/[^a-z0-9_-]/g, "_");

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_topology.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.logActivity(`Exported topology JSON (${safeName}_topology.json).`, "info");
    this.showToast("Topology exported to JSON file.", "success");
  }

  handleFileImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const data = parsed.topology || parsed; // support both exported wrapper and raw topology

        if (!data.devices || !Array.isArray(data.devices)) {
          throw new Error("Invalid topology format: Missing devices array.");
        }
        if (!data.connections || !Array.isArray(data.connections)) {
          throw new Error("Invalid topology format: Missing connections array.");
        }

        this.tm.loadFromData(data);
        this.currentSavedId = null;
        this.canvas.clearHighlights();
        this.canvas.fitToView();
        this.logActivity(`Imported topology from file "${file.name}".`, "success");
        this.showToast(`Topology imported from ${file.name}.`, "success");
      } catch (err) {
        this.showToast(`Import error: ${err.message}`, "error");
      } finally {
        e.target.value = ""; // reset file input
      }
    };
    reader.readAsText(file);
  }

  openClearModal() {
    document.getElementById("modal-clear").classList.add("open");
  }

  logActivity(message, level = "info") {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this.activityLog.unshift({ time, message, level });
    if (this.activityLog.length > 50) this.activityLog.pop();

    const stream = document.getElementById("activity-log-stream");
    if (!stream) return;

    stream.innerHTML = this.activityLog.map(item => `
      <div class="activity-item ${item.level}">
        <span class="activity-time">${item.time}</span>
        <span class="activity-text">${this.canvas.escapeHtml(item.message)}</span>
      </div>
    `).join("");
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  initKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Avoid triggering when focused inside text inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.tm.selectedDeviceId) {
          this.tm.deleteDevice(this.tm.selectedDeviceId);
          this.showToast("Device deleted.", "warning");
        } else if (this.tm.selectedConnectionId) {
          this.tm.deleteConnection(this.tm.selectedConnectionId);
          this.showToast("Connection deleted.", "warning");
        }
      } else if (e.key === "Escape") {
        this.tm.clearSelection();
        this.setActiveTool("select");
        document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
        this.canvas.render();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          this.tm.redo();
        } else {
          this.tm.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.tm.redo();
      }
    });
  }

  startHealthPolling() {
    const updateHealth = async () => {
      const dot = document.getElementById("server-status-dot");
      const label = document.getElementById("server-status-label");
      try {
        const res = await API.checkHealth();
        if (res && res.status === "healthy") {
          dot.className = "status-dot connected pulse";
          label.textContent = "Server Online";
        } else {
          dot.className = "status-dot error";
          label.textContent = "Server Issue";
        }
      } catch (err) {
        dot.className = "status-dot error";
        label.textContent = "Server Offline";
      }
    };

    updateHealth();
    setInterval(updateHealth, 10000); // Poll every 10 seconds
  }
}

// Bootstrap application on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.App = new NetSimApp();
});
