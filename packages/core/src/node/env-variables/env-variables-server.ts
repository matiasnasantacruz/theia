// *****************************************************************************
// Copyright (C) 2018-2020 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { join } from 'path';
import { homedir } from 'os';
import * as fs from 'fs';
import { injectable } from 'inversify';
import { pathExists, mkdir } from 'fs-extra';
import { EnvVariable, EnvVariablesServer } from '../../common/env-variables';
import { isWindows } from '../../common/os';
import { FileUri } from '../../common/file-uri';
import { BackendApplicationPath } from '../backend-application';
import { BackendApplicationConfigProvider } from '../backend-application-config-provider';

@injectable()
export class EnvVariablesServerImpl implements EnvVariablesServer {

    protected readonly envs: { [key: string]: EnvVariable } = {};
    protected readonly homeDirUri = FileUri.create(homedir()).toString();
    protected readonly configDirUri: Promise<string>;
    protected readonly pathExistenceCache: { [key: string]: boolean } = {};

    constructor() {
        this.configDirUri = this.createConfigDirUri();
        this.configDirUri.then(configDirUri => console.log(`Configuration directory URI: '${configDirUri}'`));
        const prEnv = process.env;
        Object.keys(prEnv).forEach((key: string) => {
            let keyName = key;
            if (isWindows) {
                keyName = key.toLowerCase();
            }
            this.envs[keyName] = { 'name': keyName, 'value': prEnv[key] };
        });
    }

    protected async createConfigDirUri(): Promise<string> {
        if (process.env.THEIA_CONFIG_DIR) {
            // this has been explicitly set by the user, so we do not override its value
            return FileUri.create(process.env.THEIA_CONFIG_DIR).toString();
        }

        const dataFolderPath = join(BackendApplicationPath, 'data');
        const userDataPath = join(dataFolderPath, 'user-data');
        const dataFolderExists = this.pathExistenceCache[dataFolderPath] ??= await pathExists(dataFolderPath);
        let theiaConfigDir: string;
        if (dataFolderExists) {
            const userDataExists = this.pathExistenceCache[userDataPath] ??= await pathExists(userDataPath);
            if (!userDataExists) {
                await mkdir(userDataPath);
                this.pathExistenceCache[userDataPath] = true;
            }
            theiaConfigDir = userDataPath;
        } else {
            theiaConfigDir = join(homedir(), BackendApplicationConfigProvider.get().configurationFolder);
        }
        return FileUri.create(theiaConfigDir).toString();
    }

    async getExecPath(): Promise<string> {
        return process.execPath;
    }

    async getVariables(): Promise<EnvVariable[]> {
        return Object.keys(this.envs).map(key => this.envs[key]);
    }

    async getValue(key: string): Promise<EnvVariable | undefined> {
        if (isWindows) {
            key = key.toLowerCase();
        }
        return this.envs[key];
    }

    getConfigDirUri(): Promise<string> {
        return this.configDirUri;
    }

    async getHomeDirUri(): Promise<string> {
        return this.homeDirUri;
    }

    async getDrives(): Promise<string[]> {
        // NOTE: On some Linux distros/kernels, the native `drivelist` module has been observed to crash the Node
        // process (SIGSEGV) even when just requiring it. To keep the backend stable in browser deployments,
        // we avoid `drivelist` on Linux and instead return a conservative list of mount points.
        if (process.platform === 'linux') {
            return this.getLinuxDrives();
        }

        const uris: string[] = [];
        // Load `drivelist` lazily to avoid crashing the backend at startup.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const drivelist = require('drivelist') as typeof import('drivelist');
        const drives = await drivelist.list();
        for (const drive of drives) {
            for (const mountpoint of drive.mountpoints) {
                if (this.filterHiddenPartitions(mountpoint.path)) {
                    uris.push(FileUri.create(mountpoint.path).toString());
                }
            }
        }
        return uris;
    }

    protected async getLinuxDrives(): Promise<string[]> {
        const uris: string[] = [];
        const mountpoints = new Set<string>();

        // Always include root.
        mountpoints.add('/');

        // Prefer "user-facing" mount points.
        try {
            const mounts = await fs.promises.readFile('/proc/mounts', 'utf8');
            for (const line of mounts.split('\n')) {
                const parts = line.trim().split(' ');
                if (parts.length < 2) {
                    continue;
                }
                // /proc/mounts uses escaped spaces as \040.
                const mount = parts[1].replace(/\\040/g, ' ');
                if (mount.startsWith('/run/media/') || mount.startsWith('/media/') || mount.startsWith('/mnt/')) {
                    mountpoints.add(mount);
                }
            }
        } catch {
            // ignore
        }

        // Include /home when present (common "drive-like" entry).
        try {
            if (await pathExists('/home')) {
                mountpoints.add('/home');
            }
        } catch {
            // ignore
        }

        for (const mountpoint of mountpoints) {
            if (this.filterHiddenPartitions(mountpoint)) {
                uris.push(FileUri.create(mountpoint).toString());
            }
        }
        return uris;
    }

    /**
     * Filters hidden and system partitions.
     */
    protected filterHiddenPartitions(path: string): boolean {
        // OS X: This is your sleep-image. When your Mac goes to sleep it writes the contents of its memory to the hard disk. (https://bit.ly/2R6cztl)
        if (path === '/private/var/vm') {
            return false;
        }
        // Ubuntu: This system partition is simply the boot partition created when the computers mother board runs UEFI rather than BIOS. (https://bit.ly/2N5duHr)
        if (path === '/boot/efi') {
            return false;
        }
        return true;
    }

}
