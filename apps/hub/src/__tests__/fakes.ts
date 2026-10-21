import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { CameraRow, RecordingRow, SettingsRow } from '@nuvigia/shared';
import pino from 'pino';

import type { Backend, CameraPatch, CloudPatch, NewCamera, NewEvent, NewRecording, RecordingPatch } from '../backend';
import type { CloudControl } from '../cloud';
import { Secrets } from '../crypto';
import type { Proc } from '../proc';
import { LocalStore } from '../store';

export const silent = pino({ level: 'silent' });
export const testSecrets = () => new Secrets(Buffer.alloc(32, 7));
export const memStore = () => new LocalStore(':memory:', testSecrets());

export const HUB = '10000000-0000-0000-0000-00000000000a';

export class FakeBackend implements Backend {
  readonly hubId = HUB;
  owner: string | null = null;
  codes = 0;
  cameras: CameraRow[] = [];
  recordings = new Map<string, RecordingRow>();
  events: NewEvent[] = [];
  cameraPatches: { id: string; patch: CameraPatch }[] = [];
  settings: SettingsRow | null = null;
  thumbnails: string[] = [];
  deletedRecordings: string[] = [];
  heartbeats = 0;
  codeTtlMs = 600_000;
  now = () => Date.now();

  publicUrl: string | null = null;
  async getOwnerId() {
    return this.owner;
  }
  async setPublicUrl(url: string | null) {
    this.publicUrl = url;
  }
  async createPairingCode() {
    this.codes++;
    return { code: String(100000 + this.codes), expiresAt: new Date(this.now() + this.codeTtlMs).toISOString() };
  }
  async heartbeat() {
    this.heartbeats++;
  }
  async listCameras() {
    return this.cameras;
  }
  async insertCamera(c: NewCamera) {
    const row: CameraRow = {
      id: `cam-${this.cameras.length + 1}`,
      hub_id: HUB,
      owner_id: this.owner,
      online: false,
      recording: false,
      rec_started_at: null,
      record_mode: 'motion',
      created_at: new Date().toISOString(),
      ...c,
    };
    this.cameras.push(row);
    return row;
  }
  async updateCamera(id: string, patch: CameraPatch) {
    this.cameraPatches.push({ id, patch });
  }
  async deleteCamera(id: string) {
    this.cameras = this.cameras.filter((c) => c.id !== id);
  }
  async insertRecording(r: NewRecording) {
    const row: RecordingRow = {
      id: r.id ?? `rec-${this.recordings.size + 1}`,
      hub_id: HUB,
      owner_id: this.owner,
      duration_sec: 0,
      provider: null,
      cloud_file_ref: null,
      upload_progress: 0,
      error: null,
      thumbnail_path: null,
      created_at: new Date().toISOString(),
      ...r,
    } as RecordingRow;
    this.recordings.set(row.id, row);
    return row;
  }
  async updateRecording(id: string, patch: RecordingPatch) {
    const r = this.recordings.get(id);
    if (r) this.recordings.set(id, { ...r, ...patch });
  }
  async getRecording(id: string) {
    return this.recordings.get(id) ?? null;
  }
  async deleteRecording(id: string) {
    this.deletedRecordings.push(id);
    this.recordings.delete(id);
  }
  async listCloudRecordingsBefore(before: string) {
    return [...this.recordings.values()].filter((r) => r.cloud_file_ref && r.started_at < before);
  }
  cloudPatches: CloudPatch[] = [];
  async insertEvent(e: NewEvent) {
    this.events.push(e);
  }
  async getSettings() {
    return this.settings;
  }
  async updateCloud(patch: CloudPatch) {
    this.cloudPatches.push(patch);
  }
  async uploadThumbnail(name: string) {
    const p = `${HUB}/${name}`;
    this.thumbnails.push(p);
    return p;
  }
  async removeThumbnails() {}
}

export class FakeCloud implements CloudControl {
  connected = false;
  ready: string[] = [];
  retried: string[] = [];
  isConnected() {
    return this.connected;
  }
  async connect() {
    this.connected = true;
    return { account: 'ana@exemplo.com' };
  }
  async disconnect() {
    this.connected = false;
  }
  async retry(id: string) {
    this.retried.push(id);
  }
  link: string | null = null;
  async webLink() {
    return this.link;
  }
  notifyFileReady(id: string) {
    this.ready.push(id);
  }
  start() {}
  async stop() {}
}

/** Processo falso: termina quando recebe "q" no stdin ou com `exit()`. */
export class FakeProc extends EventEmitter implements Proc {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  constructor(
    readonly cmd: string,
    readonly args: string[],
    onQuit?: (p: FakeProc) => void,
  ) {
    super();
    this.stdin.on('data', (d: Buffer) => {
      if (d.toString().includes('q')) {
        onQuit?.(this);
        this.exit(0);
      }
    });
  }
  exit(code: number) {
    setImmediate(() => this.emit('exit', code, null));
  }
  kill() {
    this.killed = true;
    this.exit(255);
    return true;
  }
}
