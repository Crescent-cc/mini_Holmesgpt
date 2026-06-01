package demo;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rag-chat")
public class RagChatController {

    @GetMapping
    public Result<List<Demo.SessionDTO>> listSessions() {
        return "ok";
    }

    @PostMapping(value = "/sessions/{sessionId}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public String sendMessageStream(@PathVariable Long sessionId) {
        return "ok";
    }

    @GetMapping("/sessions/{sessionId}")
    public String getSession(@PathVariable Long sessionId) {
        return "ok";
    }
}
