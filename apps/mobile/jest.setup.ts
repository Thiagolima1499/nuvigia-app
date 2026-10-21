// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Módulos nativos de vídeo não existem no Jest.
jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCView: () => null,
  MediaStream: jest.fn(),
  mediaDevices: { getUserMedia: jest.fn() },
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), muted: false }),
  VideoView: () => null,
}));
