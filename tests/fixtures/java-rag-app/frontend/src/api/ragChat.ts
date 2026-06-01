const API_BASE_URL = "http://localhost:8080";
const request = {
  async get(url: string): Promise<unknown> {
    return { url };
  },
};

export const ragChatApi = {
  async listSessions(queryString: string): Promise<unknown> {
    return request.get(`/api/rag-chat${queryString ? "?page=1" : ""}`);
  },

  async sendMessageStream(sessionId: number): Promise<Response> {
    return fetch(`${API_BASE_URL}/api/rag/chat/sessions/${sessionId}/messages/stream`, {
      method: "POST",
    });
  },

  async getSession(sessionId: number): Promise<unknown> {
    return request.get(`/api/rag-chat/sessions/${sessionId}`);
  },
};
