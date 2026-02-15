// *****************************************************************************
// Copyright (C) 2026 and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export * from './entities';
export * from './interfaces';
export { createId } from './id';
export type { IdGenerator } from './id';
export { validateBlueprintDocument, blueprintDocumentSchema } from './schema/blueprint-schema';
export { validateGraph } from './logic/graph-inference';
export type { ValidationResult, ValidationError } from './logic/graph-inference';
export { createEmptyBlueprint } from './factory';
