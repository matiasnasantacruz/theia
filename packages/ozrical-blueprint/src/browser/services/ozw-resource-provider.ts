// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';

export interface OzwResourceInfo {
    /** Path relative to workspace root (e.g. views/clientes.ozw) */
    relativePath: string;
    uri: URI;
    /** Display name (file name without .ozw, or from OZW title if we read it) */
    displayName: string;
}

const MAX_DEPTH = 10;
const OZW_EXT = '.ozw';

@injectable()
export class OzwResourceProvider {

    @inject(FileService)
    protected readonly fileService: FileService;

    /**
     * Lists all .ozw files under the given workspace root.
     * Returns relative paths and URIs for use in the Blueprint linker.
     */
    async listOzwResources(workspaceRoot: URI): Promise<OzwResourceInfo[]> {
        const results: OzwResourceInfo[] = [];
        await this.collectOzwFiles(workspaceRoot, workspaceRoot, '', results, 0);
        results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        return results;
    }

    /**
     * Resolves a resource path (relative to workspace) to a URI.
     */
    resolveResourceUri(workspaceRoot: URI, relativePath: string): URI {
        return workspaceRoot.resolve(relativePath);
    }

    /**
     * Checks if the linked .ozw file exists.
     */
    async checkResourceExists(workspaceRoot: URI, relativePath: string): Promise<boolean> {
        const uri = this.resolveResourceUri(workspaceRoot, relativePath);
        try {
            const stat = await this.fileService.resolve(uri);
            return stat.isFile;
        } catch {
            return false;
        }
    }

    private async collectOzwFiles(
        workspaceRoot: URI,
        current: URI,
        relativePrefix: string,
        out: OzwResourceInfo[],
        depth: number
    ): Promise<void> {
        if (depth > MAX_DEPTH) {
            return;
        }
        let stat: FileStat;
        try {
            stat = await this.fileService.resolve(current, { resolveTo: [current] });
        } catch {
            return;
        }
        if (stat.isFile) {
            if (current.path.ext === OZW_EXT) {
                const relativePath = relativePrefix ? `${relativePrefix}/${current.path.base}` : current.path.base;
                const displayName = current.path.name;
                out.push({ relativePath, uri: current, displayName });
            }
            return;
        }
        if (!stat.children || !stat.isDirectory) {
            return;
        }
        for (const child of stat.children) {
            const childUri = child.resource;
            const baseName = childUri.path.base;
            const childPrefix = relativePrefix ? `${relativePrefix}/${baseName}` : baseName;
            if (child.isDirectory) {
                await this.collectOzwFiles(workspaceRoot, childUri, childPrefix, out, depth + 1);
            } else if (childUri.path.ext === OZW_EXT) {
                const relativePath = childPrefix;
                const displayName = childUri.path.name;
                out.push({ relativePath, uri: childUri, displayName });
            }
        }
    }
}
