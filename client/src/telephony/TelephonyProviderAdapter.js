export class TelephonyProviderAdapter {
  constructor(provider = "unconfigured", fetchImpl = fetch) {
    this.provider = provider;
    this.supportedProviders = ["twilio", "unconfigured"];
    this.fetchImpl = fetchImpl;
  }

  getProvider() {
    return this.provider;
  }

  isConfigured() {
    return this.provider === "twilio";
  }

  async getStatus() {
    if (!this.isConfigured()) {
      return {
        provider: this.provider,
        configured: false,
      };
    }

    const response = await this.fetchImpl("/api/voice/twilio/status");
    if (!response.ok) {
      return {
        provider: this.provider,
        configured: false,
      };
    }

    return response.json();
  }

  async createTestCall(message = "") {
    const response = await this.fetchImpl("/api/voice/twilio/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || "Unable to place the test call.");
    }

    return response.json();
  }

  async fetchCalls() {
    const response = await this.fetchImpl("/api/calls");
    if (!response.ok) {
      throw new Error("Unable to load call records.");
    }

    return response.json();
  }
}

export default TelephonyProviderAdapter;
