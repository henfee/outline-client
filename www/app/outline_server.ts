// Copyright 2018 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/// <reference path='../types/outlinePlugin.d.ts'/>

import * as errors from '../model/errors';
import * as events from '../model/events';
import {Server} from '../model/server';

import {PersistentServer} from './persistent_server';

export class OutlineServer implements PersistentServer {
  constructor(
      public readonly id: string, public config: cordova.plugins.outline.ServerConfig,
      private connection: cordova.plugins.outline.Connection,
      private eventQueue: events.EventQueue) {
    this.connection.onStatusChange((status: ConnectionStatus) => {
      let statusEvent: events.OutlineEvent;
      switch (status) {
        case ConnectionStatus.CONNECTED:
          statusEvent = new events.ServerConnected(this);
          break;
        case ConnectionStatus.DISCONNECTED:
          statusEvent = new events.ServerDisconnected(this);
          break;
        case ConnectionStatus.RECONNECTING:
          statusEvent = new events.ServerReconnecting(this);
          break;
        default:
          console.warn(`Received unknown connection status ${status}`);
          return;
      }
      eventQueue.enqueue(statusEvent);
    });
  }

  get name() {
    return this.config.name || this.config.host || '';
  }

  set name(newName: string) {
    this.config.name = newName;
  }

  get host() {
    return this.config.host;
  }

  connect(): Promise<void> {
    console.log('Connecting to server');
    return this.start().catch((error: errors.OutlineNativeError) => {
      const errorCode = error.errorCode;
      switch (errorCode) {
        case errors.ErrorCode.UNEXPECTED:
          throw new errors.UnexpectedPluginError();
        case errors.ErrorCode.VPN_PERMISSION_NOT_GRANTED:
          throw new errors.VpnPermissionNotGranted();
        case errors.ErrorCode.INVALID_SERVER_CREDENTIALS:
          throw new errors.InvalidServerCredentials(this);
        case errors.ErrorCode.UDP_RELAY_NOT_ENABLED:
          throw new errors.RemoteUdpForwardingDisabled();
        case errors.ErrorCode.SERVER_UNREACHABLE:
          throw new errors.ServerUnreachable(this);
        case errors.ErrorCode.ILLEGAL_SERVER_CONFIGURATION:
          throw new errors.IllegalServerConfiguration(this.config);
        default:
          throw new errors.NetworkSystemError();
      }
    });
  }

  disconnect(): Promise<void> {
    console.log('Disconnecting from server');
    return this.stop().catch((error: {}) => {
      throw new errors.NetworkSystemError();
    });
  }

  checkRunning(): Promise<boolean> {
    return this.connection.isRunning();
  }

  checkReachable(): Promise<boolean> {
    return this.connection.isReachable();
  }

  private start(): Promise<void> {
    console.log('starting shadowsocks proxy...');
    return this.connection.start().then(() => {
      console.debug(`connected to shadowsocks server at ${this.config.host}`);
    });
  }

  private stop(): Promise<void> {
    console.debug('stopping shadowsocks...');
    return this.connection.stop().then(() => {
      console.debug('shadowsocks proxy stopped');
    });
  }
}
