"""Tree-sitter Python AST parsing and structural code chunking service."""

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional
import tree_sitter_python as tspython
from tree_sitter import Language, Node, Parser

logger = logging.getLogger("code_fix_ai.parser_service")

# Initialize Python Grammar
PY_LANGUAGE = Language(tspython.language())
_PARSER = Parser(PY_LANGUAGE)

MAX_CHUNK_LINES = 150
OVERLAP_LINES = 25


@dataclass
class ParsedChunk:
    file_path: str
    chunk_type: str  # 'function', 'class', 'method', 'module'
    symbol_name: str
    start_line: int
    end_line: int
    content: str
    content_hash: str
    commit_sha: Optional[str] = None


class PythonParserService:
    @classmethod
    def parse_file(
        cls,
        file_path: Path,
        repo_root: Path,
        commit_sha: Optional[str] = None,
    ) -> List[ParsedChunk]:
        """Parse a Python source file into semantic AST code chunks.

        Tolerates syntax errors and catches read failures gracefully.
        """
        try:
            source_bytes = file_path.read_bytes()
        except Exception as e:
            logger.warning("Failed to read file %s: %s", file_path, e)
            return []

        rel_path = str(file_path.relative_to(repo_root))

        try:
            tree = _PARSER.parse(source_bytes)
        except Exception as e:
            logger.error("Tree-sitter parse failure on %s: %s", rel_path, e)
            return []

        chunks: List[ParsedChunk] = []
        root_node = tree.root_node

        # Extract semantic definitions from the CST
        cls._extract_nodes(
            node=root_node,
            source=source_bytes,
            rel_path=rel_path,
            commit_sha=commit_sha,
            chunks=chunks,
            parent_class=None,
        )

        # If file had no class/function definitions, extract as a whole module chunk
        if not chunks and source_bytes.strip():
            cls._create_module_chunks(
                source=source_bytes,
                rel_path=rel_path,
                commit_sha=commit_sha,
                chunks=chunks,
            )

        return chunks

    @classmethod
    def _extract_nodes(
        cls,
        node: Node,
        source: bytes,
        rel_path: str,
        commit_sha: Optional[str],
        chunks: List[ParsedChunk],
        parent_class: Optional[str] = None,
    ):
        """Recursively traverse AST to extract functions, classes, and methods."""
        for child in node.children:
            if child.type == "class_definition":
                cls._process_class(child, source, rel_path, commit_sha, chunks)

            elif child.type == "function_definition":
                chunk_type = "method" if parent_class else "function"
                cls._process_function(
                    child,
                    source,
                    rel_path,
                    commit_sha,
                    chunks,
                    parent_class=parent_class,
                    chunk_type=chunk_type,
                )

            elif child.type == "decorated_definition":
                # Handle decorated functions/classes: extract the inner definition
                for sub in child.children:
                    if sub.type == "class_definition":
                        cls._process_class(
                            sub,
                            source,
                            rel_path,
                            commit_sha,
                            chunks,
                            wrapper_node=child,
                        )
                    elif sub.type == "function_definition":
                        chunk_type = "method" if parent_class else "function"
                        cls._process_function(
                            sub,
                            source,
                            rel_path,
                            commit_sha,
                            chunks,
                            parent_class=parent_class,
                            chunk_type=chunk_type,
                            wrapper_node=child,
                        )

    @classmethod
    def _process_class(
        cls,
        class_node: Node,
        source: bytes,
        rel_path: str,
        commit_sha: Optional[str],
        chunks: List[ParsedChunk],
        wrapper_node: Optional[Node] = None,
    ):
        """Extract a class definition and then extract its internal methods."""
        class_name = cls._get_identifier_name(class_node, source) or "AnonymousClass"
        effective_node = wrapper_node or class_node

        cls._add_chunk(
            node=effective_node,
            source=source,
            rel_path=rel_path,
            chunk_type="class",
            symbol_name=class_name,
            commit_sha=commit_sha,
            chunks=chunks,
        )

        # Find the class body block and extract methods
        for child in class_node.children:
            if child.type == "block":
                cls._extract_nodes(
                    node=child,
                    source=source,
                    rel_path=rel_path,
                    commit_sha=commit_sha,
                    chunks=chunks,
                    parent_class=class_name,
                )

    @classmethod
    def _process_function(
        cls,
        fn_node: Node,
        source: bytes,
        rel_path: str,
        commit_sha: Optional[str],
        chunks: List[ParsedChunk],
        parent_class: Optional[str] = None,
        chunk_type: str = "function",
        wrapper_node: Optional[Node] = None,
    ):
        """Extract a function or method definition."""
        fn_name = cls._get_identifier_name(fn_node, source) or "anonymous_function"
        full_symbol = f"{parent_class}.{fn_name}" if parent_class else fn_name
        effective_node = wrapper_node or fn_node

        cls._add_chunk(
            node=effective_node,
            source=source,
            rel_path=rel_path,
            chunk_type=chunk_type,
            symbol_name=full_symbol,
            commit_sha=commit_sha,
            chunks=chunks,
        )

    @classmethod
    def _add_chunk(
        cls,
        node: Node,
        source: bytes,
        rel_path: str,
        chunk_type: str,
        symbol_name: str,
        commit_sha: Optional[str],
        chunks: List[ParsedChunk],
    ):
        """Build chunk with start/end lines and handle oversized chunk splitting."""
        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1
        raw_text = source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
        total_lines = end_line - start_line + 1

        if total_lines <= MAX_CHUNK_LINES:
            content_hash = hashlib.sha256(raw_text.strip().encode("utf-8")).hexdigest()
            chunks.append(
                ParsedChunk(
                    file_path=rel_path,
                    chunk_type=chunk_type,
                    symbol_name=symbol_name,
                    start_line=start_line,
                    end_line=end_line,
                    content=raw_text,
                    content_hash=content_hash,
                    commit_sha=commit_sha,
                )
            )
        else:
            # Controlled sliding-window splitting for oversized functions
            lines = raw_text.splitlines()
            step = MAX_CHUNK_LINES - OVERLAP_LINES
            part = 1
            for i in range(0, len(lines), step):
                window_lines = lines[i:i + MAX_CHUNK_LINES]
                if not window_lines:
                    break
                part_content = "\n".join(window_lines)
                part_start = start_line + i
                part_end = min(start_line + i + len(window_lines) - 1, end_line)
                part_hash = hashlib.sha256(part_content.strip().encode("utf-8")).hexdigest()
                chunks.append(
                    ParsedChunk(
                        file_path=rel_path,
                        chunk_type=chunk_type,
                        symbol_name=f"{symbol_name} (part {part})",
                        start_line=part_start,
                        end_line=part_end,
                        content=part_content,
                        content_hash=part_hash,
                        commit_sha=commit_sha,
                    )
                )
                part += 1

    @classmethod
    def _create_module_chunks(
        cls,
        source: bytes,
        rel_path: str,
        commit_sha: Optional[str],
        chunks: List[ParsedChunk],
    ):
        """Create module-level chunks for scripts or configuration files without classes/functions."""
        text = source.decode("utf-8", errors="replace")
        lines = text.splitlines()
        if not lines:
            return

        module_name = Path(rel_path).stem
        if len(lines) <= MAX_CHUNK_LINES:
            content_hash = hashlib.sha256(text.strip().encode("utf-8")).hexdigest()
            chunks.append(
                ParsedChunk(
                    file_path=rel_path,
                    chunk_type="module",
                    symbol_name=module_name,
                    start_line=1,
                    end_line=len(lines),
                    content=text,
                    content_hash=content_hash,
                    commit_sha=commit_sha,
                )
            )
        else:
            step = MAX_CHUNK_LINES - OVERLAP_LINES
            part = 1
            for i in range(0, len(lines), step):
                window = lines[i:i + MAX_CHUNK_LINES]
                part_content = "\n".join(window)
                chunks.append(
                    ParsedChunk(
                        file_path=rel_path,
                        chunk_type="module",
                        symbol_name=f"{module_name} (part {part})",
                        start_line=i + 1,
                        end_line=min(i + len(window), len(lines)),
                        content=part_content,
                        content_hash=hashlib.sha256(part_content.strip().encode("utf-8")).hexdigest(),
                        commit_sha=commit_sha,
                    )
                )
                part += 1

    @staticmethod
    def _get_identifier_name(node: Node, source: bytes) -> Optional[str]:
        """Locate the identifier child node that holds the definition's name."""
        for child in node.children:
            if child.type == "identifier":
                return source[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
        return None

