import {
  ASTAssignmentStatement,
  ASTBase,
  ASTBaseBlock,
  ASTChunk,
  ASTComment,
  ASTForGenericStatement,
  ASTIfStatement,
  ASTWhileStatement
} from 'miniscript-core';

import {
  getBlockCloseEndLine,
  getBlockOpenerEndLine
} from './block-helpers';
import { merge } from '../../utils/merge';

export interface CommentNode {
  /** Whether from a block comment */
  isMultiline: boolean;
  /** First line of a block comment */
  isStart: boolean;
  /** Last line of a block comment */
  isEnd: boolean;
  /** Text content (without delimiters) */
  value: string;
}

/**
 * Result of the comment attachment process.
 */
export interface CommentAttachmentResult {
  /**
   * Own-line comments structurally attached as "leading" to the next body item.
   */
  leadingComments: Map<ASTBase, CommentNode[]>;

  /**
   * Own-line comments inside empty blocks or after the last body item.
   */
  danglingComments: Map<ASTBase, CommentNode[]>;

  /**
   * "Before-code" multiline comment segments indexed by source line number.
   */
  beforeBuckets: Map<number, CommentNode[]>;

  /**
   * "After-code" inline comment segments indexed by source line number.
   */
  trailingBuckets: Map<number, CommentNode[]>;
}

/**
 * Splits a single ASTComment into CommentNode(s).
 * Single-line: one node. Multiline: one node per source line.
 */
function splitComment(comment: ASTComment): CommentNode[] {
  if (!comment.isMultiline) {
    return [
      {
        isMultiline: false,
        isStart: false,
        isEnd: false,
        value: comment.value
      }
    ];
  }

  const lines = comment.value.split('\n');
  return lines.map((segment, index) => ({
    isMultiline: true,
    isStart: index === 0,
    isEnd: index === lines.length - 1,
    value: segment
  }));
}

function upsertToMap(
  map: Map<ASTBase, CommentNode[]>,
  node: ASTBase,
  commentNodes: CommentNode[]
): void {
  let item = map.get(node);
  if (!item) map.set(node, item = []);
  merge(item, commentNodes);
}

function upsertToBucket(
  buckets: Map<number, CommentNode[]>,
  lineNr: number,
  node: CommentNode
): void {
  let item = buckets.get(lineNr);
  if (!item) buckets.set(lineNr, item = []);
  item.push(node);
}

interface BlockInfo {
  block: ASTBaseBlock;
  bodyStartLine: number;
  bodyEndLine: number;
  bodyItems: ASTBase[];
}

function collectBlockInfos(chunk: ASTChunk): BlockInfo[] {
  const result: BlockInfo[] = [];
  const queue: ASTBaseBlock[] = [chunk];

  while (queue.length > 0) {
    const block = queue.shift()!;
    const bodyItems = block.body;

    result.push({
      block,
      bodyStartLine: getBlockOpenerEndLine(block),
      bodyEndLine: getBlockCloseEndLine(block),
      bodyItems
    });

    // Enqueue child blocks for processing
    for (const child of block.body) {
      enqueueChildBlocks(child, queue);
    }
  }

  return result;
}

function enqueueChildBlocks(
  node: ASTBase,
  queue: ASTBaseBlock[]
): void {
  if (
    node instanceof ASTAssignmentStatement &&
    node.init instanceof ASTBaseBlock
  ) {
    queue.push(node.init);
  } else if (node instanceof ASTIfStatement) {
    queue.push(...node.clauses);
  } else if (
    node instanceof ASTWhileStatement ||
    node instanceof ASTForGenericStatement
  ) {
    queue.push(node);
  }
}

function isCommentInBlockBodyRange(
  comment: ASTComment,
  info: BlockInfo
): boolean {
  return (
    comment.start.line > info.bodyStartLine &&
    comment.start.line < info.bodyEndLine
  );
}

export function processComments(chunk: ASTChunk): CommentAttachmentResult {
  const leadingComments: Map<ASTBase, CommentNode[]> = new Map();
  const danglingComments: Map<ASTBase, CommentNode[]> = new Map();
  const beforeBuckets: Map<number, CommentNode[]> = new Map();
  const trailingBuckets: Map<number, CommentNode[]> = new Map();
  const comments = chunk.comments;

  if (comments.length === 0) {
    return { leadingComments, danglingComments, beforeBuckets, trailingBuckets };
  }

  const ownLineComments: ASTComment[] = [];

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];

    if (comment.isMultiline && comment.isStatement) {
      // Own-line multiline comment (starts on its own line).
      // Segments go to beforeBuckets — they should appear BEFORE any code
      // that shares their line (the last segment may share a line with code).
      const nodes = splitComment(comment);
      nodes.forEach((node, offset) => {
        upsertToBucket(beforeBuckets, comment.start.line + offset, node);
      });
    } else if (comment.isMultiline) {
      // Inline multiline comment (shares start line with code).
      // Segments go to trailingBuckets — they appear AFTER code.
      const nodes = splitComment(comment);
      nodes.forEach((node, offset) => {
        upsertToBucket(trailingBuckets, comment.start.line + offset, node);
      });
    } else if (!comment.isStatement) {
      // Single-line inline → trailing bucket
      const nodes = splitComment(comment);
      upsertToBucket(trailingBuckets, comment.start.line, nodes[0]);
    } else {
      // Single-line own-line → structural attachment
      ownLineComments.push(comment);
    }
  }

  const blockInfos = collectBlockInfos(chunk);
  const attached = new Set<ASTComment>();

  for (let i = blockInfos.length - 1; i >= 0; i--) {
    const info = blockInfos[i];
    const scopeComments = ownLineComments.filter(
      (c) => !attached.has(c) && isCommentInBlockBodyRange(c, info)
    );

    if (scopeComments.length === 0) continue;

    const bodyItems = info.bodyItems;

    if (bodyItems.length === 0) {
      // Empty block: all own-line comments are dangling
      for (const comment of scopeComments) {
        attached.add(comment);
        upsertToMap(danglingComments, info.block, splitComment(comment));
      }
      continue;
    }

    for (let j = 0; j < scopeComments.length; j++) {
      const comment = scopeComments[j];

      attached.add(comment);
      const nodes = splitComment(comment);

      // Find the next body item after this comment
      const nextItem = bodyItems.find(
        (item) =>
          item.start.line > comment.end.line ||
          (item.start.line === comment.end.line &&
            item.start.character > comment.end.character)
      );

      if (nextItem) {
        upsertToMap(leadingComments, nextItem, nodes);
      } else {
        upsertToMap(danglingComments, info.block, nodes);
      }
    }
  }

  // Any remaining unattached own-line comments → dangling on chunk
  for (const comment of ownLineComments) {
    if (!attached.has(comment)) {
      attached.add(comment);
      upsertToMap(danglingComments, chunk, splitComment(comment));
    }
  }

  return { leadingComments, danglingComments, beforeBuckets, trailingBuckets };
}
