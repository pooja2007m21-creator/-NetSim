/**
 * NetSim Topology State & Preset Engine
 * Manages devices, connections, history (undo/redo), and topology presets.
 */

class TopologyManager {
  constructor() {
    this.name = "Untitled Network";
    this.description = "";
    this.devices = [];
    this.connections = [];

    this.selectedDeviceId = null;
    this.selectedConnectionId = null;
    this.sourceConnectingDeviceId = null;

    this.activeTool = "select"; // 'select', 'connect', 'delete'
    this.maxDevices = 50;

    // Undo / Redo history stacks
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;

    // Listeners for state changes
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify(changeType = "change") {
    for (const listener of this.listeners) {
      listener(this, changeType);
    }
  }

  saveSnapshot() {
    const snapshot = {
      name: this.name,
      description: this.description,
      devices: JSON.parse(JSON.stringify(this.devices)),
      connections: JSON.parse(JSON.stringify(this.connections)),
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    const currentSnapshot = {
      name: this.name,
      description: this.description,
      devices: JSON.parse(JSON.stringify(this.devices)),
      connections: JSON.parse(JSON.stringify(this.connections)),
    };
    this.redoStack.push(currentSnapshot);

    const prevSnapshot = this.undoStack.pop();
    this.name = prevSnapshot.name;
    this.description = prevSnapshot.description;
    this.devices = prevSnapshot.devices;
    this.connections = prevSnapshot.connections;
    this.clearSelection();
    this.notify("undo");
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const currentSnapshot = {
      name: this.name,
      description: this.description,
      devices: JSON.parse(JSON.stringify(this.devices)),
      connections: JSON.parse(JSON.stringify(this.connections)),
    };
    this.undoStack.push(currentSnapshot);

    const nextSnapshot = this.redoStack.pop();
    this.name = nextSnapshot.name;
    this.description = nextSnapshot.description;
    this.devices = nextSnapshot.devices;
    this.connections = nextSnapshot.connections;
    this.clearSelection();
    this.notify("redo");
    return true;
  }

  /**
   * Add a new network device.
   */
  addDevice(type, x, y, customName = null) {
    if (this.devices.length >= this.maxDevices) {
      throw new Error(`Device limit reached! Maximum allowed devices: ${this.maxDevices}.`);
    }

    this.saveSnapshot();

    const prefix = type === "Computer" ? "PC" : type === "Switch" ? "SW" : "R";
    const count = this.devices.filter(d => d.type === type).length + 1;
    const uniqueId = `dev_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const name = customName || `${prefix}-${count}`;

    const newDevice = {
      id: uniqueId,
      type: type,
      name: name,
      x: Math.round(x),
      y: Math.round(y),
      created_at: new Date().toISOString(),
    };

    this.devices.push(newDevice);
    this.selectedDeviceId = uniqueId;
    this.selectedConnectionId = null;
    this.notify("addDevice");
    return newDevice;
  }

  renameDevice(id, newName) {
    const dev = this.devices.find(d => d.id === id);
    if (!dev) return false;

    const trimmed = (newName || "").trim();
    if (!trimmed) {
      throw new Error("Device name cannot be blank.");
    }
    if (trimmed.length > 64) {
      throw new Error("Device name cannot exceed 64 characters.");
    }

    this.saveSnapshot();
    dev.name = trimmed;
    this.notify("renameDevice");
    return true;
  }

  moveDevice(id, x, y, recordHistory = false) {
    const dev = this.devices.find(d => d.id === id);
    if (!dev) return;

    if (recordHistory) {
      this.saveSnapshot();
    }

    dev.x = Math.round(x);
    dev.y = Math.round(y);
    this.notify("moveDevice");
  }

  deleteDevice(id) {
    const devIndex = this.devices.findIndex(d => d.id === id);
    if (devIndex === -1) return false;

    this.saveSnapshot();

    // Remove device
    const removedDevice = this.devices.splice(devIndex, 1)[0];

    // Automatically remove all connected links
    this.connections = this.connections.filter(c => c.from !== id && c.to !== id);

    if (this.selectedDeviceId === id) {
      this.selectedDeviceId = null;
    }
    if (this.sourceConnectingDeviceId === id) {
      this.sourceConnectingDeviceId = null;
    }

    this.notify("deleteDevice");
    return removedDevice;
  }

  /**
   * Establish a connection between two devices.
   */
  addConnection(fromId, toId) {
    if (fromId === toId) {
      throw new Error("Invalid connection: A device cannot connect to itself (self-loop).");
    }

    const devFrom = this.devices.find(d => d.id === fromId);
    const devTo = this.devices.find(d => d.id === toId);

    if (!devFrom || !devTo) {
      throw new Error("One or both devices no longer exist.");
    }

    // Check if an undirected link already exists
    const exists = this.connections.some(c =>
      (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );

    if (exists) {
      throw new Error(`A connection already exists between ${devFrom.name} and ${devTo.name}.`);
    }

    this.saveSnapshot();

    const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newConn = {
      id: connId,
      from: fromId,
      to: toId,
      status: "active",
    };

    this.connections.push(newConn);
    this.selectedConnectionId = connId;
    this.notify("addConnection");
    return newConn;
  }

  deleteConnection(id) {
    const connIndex = this.connections.findIndex(c => c.id === id);
    if (connIndex === -1) return false;

    this.saveSnapshot();
    const removed = this.connections.splice(connIndex, 1)[0];

    if (this.selectedConnectionId === id) {
      this.selectedConnectionId = null;
    }

    this.notify("deleteConnection");
    return removed;
  }

  clearTopology() {
    this.saveSnapshot();
    this.devices = [];
    this.connections = [];
    this.clearSelection();
    this.notify("clear");
  }

  clearSelection() {
    this.selectedDeviceId = null;
    this.selectedConnectionId = null;
    this.sourceConnectingDeviceId = null;
  }

  selectDevice(id) {
    this.selectedDeviceId = id;
    this.selectedConnectionId = null;
    this.notify("select");
  }

  selectConnection(id) {
    this.selectedConnectionId = id;
    this.selectedDeviceId = null;
    this.notify("select");
  }

  getPayload() {
    return {
      name: this.name,
      description: this.description,
      devices: this.devices,
      connections: this.connections,
    };
  }

  loadFromData(data) {
    this.saveSnapshot();
    this.name = data.name || "Imported Topology";
    this.description = data.description || "";
    this.devices = (data.devices || []).map(d => ({
      id: d.id,
      type: d.type,
      name: d.name || d.id,
      x: Math.round(d.x),
      y: Math.round(d.y),
      created_at: d.created_at || new Date().toISOString(),
    }));
    this.connections = (data.connections || []).map(c => ({
      id: c.id,
      from: c.from,
      to: c.to,
      status: c.status || "active",
    }));

    this.clearSelection();
    this.notify("load");
  }

  /**
   * Educational Preset Topologies
   */
  generatePreset(presetType, canvasWidth = 800, canvasHeight = 600) {
    this.saveSnapshot();
    this.devices = [];
    this.connections = [];
    this.clearSelection();

    const cx = Math.round(canvasWidth / 2);
    const cy = Math.round(canvasHeight / 2);

    switch (presetType) {
      case "star": {
        this.name = "Star Network Topology";
        this.description = "Multiple client computers connected radially to a central network switch.";

        // Central Switch
        const sw = { id: "sw_center", type: "Switch", name: "Core-Switch-1", x: cx, y: cy };
        this.devices.push(sw);

        // 5 Peripheral Computers in a circle
        const numPCs = 5;
        const radius = 180;
        for (let i = 0; i < numPCs; i++) {
          const angle = (i * 2 * Math.PI) / numPCs - Math.PI / 2;
          const px = Math.round(cx + radius * Math.cos(angle));
          const py = Math.round(cy + radius * Math.sin(angle));
          const pc = { id: `pc_${i + 1}`, type: "Computer", name: `Host-PC-${i + 1}`, x: px, y: py };
          this.devices.push(pc);
          this.connections.push({ id: `c_star_${i + 1}`, from: pc.id, to: sw.id });
        }
        break;
      }

      case "bus": {
        this.name = "Bus Topology (Backbone Model)";
        this.description = "Computers tap into a conceptual linear backbone cable chain.";

        const count = 5;
        const startX = cx - 280;
        const spacingX = 140;
        const backboneY = cy;

        for (let i = 0; i < count; i++) {
          const px = startX + i * spacingX;
          const pc = { id: `pc_bus_${i + 1}`, type: "Computer", name: `Bus-PC-${i + 1}`, x: px, y: backboneY };
          this.devices.push(pc);

          if (i > 0) {
            this.connections.push({
              id: `c_bus_${i}`,
              from: `pc_bus_${i}`,
              to: pc.id,
            });
          }
        }
        break;
      }

      case "ring": {
        this.name = "Ring Network Topology";
        this.description = "Devices connected in a closed circular loop where each device connects to exactly two neighbors.";

        const count = 6;
        const radius = 200;
        for (let i = 0; i < count; i++) {
          const angle = (i * 2 * Math.PI) / count;
          const px = Math.round(cx + radius * Math.cos(angle));
          const py = Math.round(cy + radius * Math.sin(angle));
          const devType = i % 3 === 0 ? "Switch" : "Computer";
          const dev = {
            id: `dev_ring_${i + 1}`,
            type: devType,
            name: `${devType === "Switch" ? "SW" : "PC"}-Node-${i + 1}`,
            x: px,
            y: py,
          };
          this.devices.push(dev);
        }

        for (let i = 0; i < count; i++) {
          const nextIndex = (i + 1) % count;
          this.connections.push({
            id: `c_ring_${i + 1}`,
            from: this.devices[i].id,
            to: this.devices[nextIndex].id,
          });
        }
        break;
      }

      case "mesh": {
        this.name = "Mesh Network Topology";
        this.description = "Devices interconnected with multiple redundant paths for high fault tolerance.";

        const count = 5;
        const radius = 190;
        for (let i = 0; i < count; i++) {
          const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
          const px = Math.round(cx + radius * Math.cos(angle));
          const py = Math.round(cy + radius * Math.sin(angle));
          const devType = i === 0 ? "Router" : i % 2 === 1 ? "Switch" : "Computer";
          this.devices.push({
            id: `dev_mesh_${i + 1}`,
            type: devType,
            name: `${devType}-${i + 1}`,
            x: px,
            y: py,
          });
        }

        // Full mesh connections: every node connects to every other node
        let cId = 1;
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            this.connections.push({
              id: `c_mesh_${cId++}`,
              from: this.devices[i].id,
              to: this.devices[j].id,
            });
          }
        }
        break;
      }

      case "tree": {
        this.name = "Hierarchical Tree Topology";
        this.description = "Root router branching into aggregation switches and access computers.";

        // Root Router
        const root = { id: "r_root", type: "Router", name: "Core-Router", x: cx, y: cy - 160 };
        this.devices.push(root);

        // Tier 2: 2 Distribution Switches
        const swLeft = { id: "sw_left", type: "Switch", name: "Dist-SW-East", x: cx - 180, y: cy };
        const swRight = { id: "sw_right", type: "Switch", name: "Dist-SW-West", x: cx + 180, y: cy };
        this.devices.push(swLeft, swRight);

        this.connections.push(
          { id: "c_tree_root1", from: root.id, to: swLeft.id },
          { id: "c_tree_root2", from: root.id, to: swRight.id }
        );

        // Tier 3: 4 End User PCs
        const pc1 = { id: "pc_tree_1", type: "Computer", name: "Host-A1", x: cx - 260, y: cy + 160 };
        const pc2 = { id: "pc_tree_2", type: "Computer", name: "Host-A2", x: cx - 100, y: cy + 160 };
        const pc3 = { id: "pc_tree_3", type: "Computer", name: "Host-B1", x: cx + 100, y: cy + 160 };
        const pc4 = { id: "pc_tree_4", type: "Computer", name: "Host-B2", x: cx + 260, y: cy + 160 };
        this.devices.push(pc1, pc2, pc3, pc4);

        this.connections.push(
          { id: "c_tree_pc1", from: swLeft.id, to: pc1.id },
          { id: "c_tree_pc2", from: swLeft.id, to: pc2.id },
          { id: "c_tree_pc3", from: swRight.id, to: pc3.id },
          { id: "c_tree_pc4", from: swRight.id, to: pc4.id }
        );
        break;
      }

      default:
        this.name = "Custom Topology";
        this.description = "Empty custom topology canvas.";
        break;
    }

    this.notify("preset");
  }
}

window.TopologyManager = TopologyManager;
