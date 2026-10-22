/**
 * NetSim API Client Module
 * Provides asynchronous methods for communicating with Flask REST API endpoints.
 */

const API = {
  baseUrl: "/api",
  timeoutMs: 10000,

  /**
   * Helper method to execute fetch requests with timeouts and JSON parsing.
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const defaultHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = (data && data.error) || `HTTP Error ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(`Request timed out after ${this.timeoutMs / 1000} seconds.`);
      }
      throw err;
    }
  },

  /** Check backend server health */
  async checkHealth() {
    return this.request("/health", { method: "GET" });
  },

  /** List all saved topologies */
  async getTopologies() {
    return this.request("/topologies", { method: "GET" });
  },

  /** Retrieve a single saved topology by ID */
  async getTopology(id) {
    return this.request(`/topologies/${id}`, { method: "GET" });
  },

  /** Save a new topology */
  async saveTopology(topologyData) {
    return this.request("/topologies", {
      method: "POST",
      body: JSON.stringify(topologyData),
    });
  },

  /** Update an existing saved topology */
  async updateTopology(id, topologyData) {
    return this.request(`/topologies/${id}`, {
      method: "PUT",
      body: JSON.stringify(topologyData),
    });
  },

  /** Delete a saved topology */
  async deleteTopology(id) {
    return this.request(`/topologies/${id}`, {
      method: "DELETE",
    });
  },

  /** Export saved topology JSON */
  async exportTopology(id) {
    return this.request(`/topology/export/${id}`, { method: "GET" });
  },

  /** Run connectivity & BFS reachability analysis */
  async analyzeConnectivity(payload) {
    return this.request("/analyze/connectivity", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Calculate shortest path between two devices */
  async calculateShortestPath(payload) {
    return this.request("/analyze/shortest-path", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Decompose network into connected components */
  async analyzeComponents(payload) {
    return this.request("/analyze/components", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Retrieve full topology summary */
  async getSummary(payload) {
    return this.request("/analyze/summary", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

window.API = API;
