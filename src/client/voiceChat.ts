// Voice Chat System using WebRTC
// Peer-to-peer audio communication between players in a room

import { ServerMessageType } from "../shared/messages";

export interface VoiceChatConfig {
    enabled: boolean;
    pushToTalk: boolean;
    pushToTalkKey: string; // Key code for push-to-talk
    volume: number; // 0-100
    mute: boolean;
}

export class VoiceChatManager {
    private localStream: MediaStream | null = null;
    private peers: Map<string, RTCPeerConnection> = new Map();
    private audioElements: Map<string, HTMLAudioElement> = new Map();
    private config: VoiceChatConfig = {
        enabled: false,
        pushToTalk: false,
        pushToTalkKey: "KeyV", // V key by default
        volume: 70,
        mute: false
    };
    private isTalking: boolean = false;
    private inputMap: Map<string, boolean> = new Map();
    private signalingServer: WebSocket | null = null;
    private roomId: string | null = null;
    private playerId: string | null = null;

    constructor() {
        // Listen for keyboard events
        window.addEventListener("keydown", (e) => {
            this.inputMap.set(e.code, true);
            this.updateTalkingState();
        });

        window.addEventListener("keyup", (e) => {
            this.inputMap.set(e.code, false);
            this.updateTalkingState();
        });
    }

    async initialize(signalingServerUrl: string, roomId: string, playerId: string): Promise<boolean> {
        try {
            this.roomId = roomId;
            this.playerId = playerId;

            // Connect to signaling server (can be the same WebSocket server)
            this.signalingServer = new WebSocket(signalingServerUrl);
            
            this.signalingServer.onopen = () => {
                console.log("[VoiceChat] Connected to signaling server");
                // Join voice room
                this.signalingServer?.send(JSON.stringify({
                    type: "voice_join",
                    roomId,
                    playerId
                }));
            };

            this.signalingServer.onmessage = async (event) => {
                try {
                    const message = JSON.parse(event.data);
                    await this.handleSignalingMessage(message);
                } catch (error) {
                    console.error("[VoiceChat] Error handling signaling message:", error);
                }
            };

            this.signalingServer.onerror = (error) => {
                console.error("[VoiceChat] Signaling server error:", error);
            };

            // Request microphone access
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                }
            });

            // Mute local audio (we don't want to hear ourselves)
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.config.mute;
            });

            this.config.enabled = true;
            console.log("[VoiceChat] Initialized successfully");
            return true;
        } catch (error) {
            console.error("[VoiceChat] Initialization error:", error);
            return false;
        }
    }

    async handleSignalingMessage(message: any): Promise<void> {
        // Handle both direct signaling messages and server-forwarded messages
        const msgType = message.type;
        const from = message.from || message.data?.from;
        
        switch (msgType) {
            case "voice_offer":
                if (message.data?.offer) {
                    await this.handleOffer(from, message.data.offer);
                } else if (message.offer) {
                    await this.handleOffer(from, message.offer);
                }
                break;
            case "voice_answer":
                if (message.data?.answer) {
                    await this.handleAnswer(from, message.data.answer);
                } else if (message.answer) {
                    await this.handleAnswer(from, message.answer);
                }
                break;
            case "voice_ice_candidate":
                if (message.data?.candidate) {
                    await this.handleIceCandidate(from, message.data.candidate);
                } else if (message.candidate) {
                    await this.handleIceCandidate(from, message.candidate);
                }
                break;
            case "voice_player_joined":
            case "VOICE_PLAYER_JOINED":
                if (from && from !== this.playerId) {
                    await this.createPeerConnection(from);
                }
                break;
            case "voice_player_left":
            case "VOICE_PLAYER_LEFT":
                this.removePeer(from || message.playerId);
                break;
        }
    }

    private async createPeerConnection(remotePlayerId: string): Promise<void> {
        if (this.peers.has(remotePlayerId)) {
            return; // Already connected
        }

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        });

        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream!);
            });
        }

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            this.handleRemoteStream(remotePlayerId, remoteStream);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage({
                    type: "voice_ice_candidate",
                    to: remotePlayerId,
                    candidate: event.candidate
                });
            }
        };

        this.peers.set(remotePlayerId, peerConnection);

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        this.sendSignalingMessage({
            type: "voice_offer",
            to: remotePlayerId,
            offer: offer
        });
    }

    private async handleOffer(from: string, offer: RTCSessionDescriptionInit): Promise<void> {
        let peerConnection = this.peers.get(from);
        
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" }
                ]
            });

            // Add local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection!.addTrack(track, this.localStream!);
                });
            }

            // Handle remote stream
            peerConnection.ontrack = (event) => {
                const remoteStream = event.streams[0];
                this.handleRemoteStream(from, remoteStream);
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingMessage({
                        type: "voice_ice_candidate",
                        to: from,
                        candidate: event.candidate
                    });
                }
            };

            this.peers.set(from, peerConnection);
        }

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.sendSignalingMessage({
            type: "voice_answer",
            to: from,
            answer: answer
        });
    }

    private async handleAnswer(from: string, answer: RTCSessionDescriptionInit): Promise<void> {
        const peerConnection = this.peers.get(from);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(answer);
        }
    }

    private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit): Promise<void> {
        const peerConnection = this.peers.get(from);
        if (peerConnection) {
            await peerConnection.addIceCandidate(candidate);
        }
    }

    private handleRemoteStream(playerId: string, stream: MediaStream): void {
        // Create audio element for remote player
        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.volume = this.config.volume / 100;
        audio.style.display = "none";
        document.body.appendChild(audio);

        this.audioElements.set(playerId, audio);
        console.log(`[VoiceChat] Remote stream received from ${playerId}`);
    }

    private removePeer(playerId: string): void {
        const peerConnection = this.peers.get(playerId);
        if (peerConnection) {
            peerConnection.close();
            this.peers.delete(playerId);
        }

        const audio = this.audioElements.get(playerId);
        if (audio) {
            audio.remove();
            this.audioElements.delete(playerId);
        }
    }

    private sendSignalingMessage(message: any): void {
        if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
            this.signalingServer.send(JSON.stringify({
                ...message,
                from: this.playerId,
                roomId: this.roomId
            }));
        }
    }

    private updateTalkingState(): void {
        if (!this.config.enabled || !this.localStream) return;

        let shouldTalk = false;

        if (this.config.pushToTalk) {
            // Push-to-talk mode
            shouldTalk = this.inputMap.get(this.config.pushToTalkKey) === true;
        } else {
            // Always-on mode (voice activity detection handled by browser)
            shouldTalk = !this.config.mute;
        }

        // Update audio tracks
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = shouldTalk;
            });
        }

        this.isTalking = shouldTalk;
    }

    setConfig(config: Partial<VoiceChatConfig>): void {
        this.config = { ...this.config, ...config };
        this.updateTalkingState();

        // Update volume for all remote audio elements
        this.audioElements.forEach(audio => {
            audio.volume = this.config.volume / 100;
        });
    }

    getConfig(): VoiceChatConfig {
        return { ...this.config };
    }

    isEnabled(): boolean {
        return this.config.enabled;
    }

    isTalkingNow(): boolean {
        return this.isTalking;
    }

    async enable(): Promise<boolean> {
        if (this.config.enabled) return true;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.config.enabled = true;
            this.updateTalkingState();
            return true;
        } catch (error) {
            console.error("[VoiceChat] Failed to enable:", error);
            return false;
        }
    }

    disable(): void {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close all peer connections
        this.peers.forEach(peer => peer.close());
        this.peers.clear();

        // Remove all audio elements
        this.audioElements.forEach(audio => audio.remove());
        this.audioElements.clear();

        // Close signaling connection
        if (this.signalingServer) {
            this.signalingServer.close();
            this.signalingServer = null;
        }

        this.config.enabled = false;
    }

    cleanup(): void {
        this.disable();
    }
}

export const voiceChatManager = new VoiceChatManager();

