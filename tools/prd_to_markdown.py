"""Convert the approved PRD .docx into GitHub-readable markdown.

Keeps document order (paragraphs and tables interleaved), maps the docx heading
styles to markdown levels, and renders tables as pipe tables.
"""
import sys
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn


def iter_block_items(parent):
    body = parent.element.body
    for child in body.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)


def heading_level(paragraph):
    style = (paragraph.style.name or '').strip().lower()
    if style == 'title':
        return 1
    if style.startswith('heading'):
        tail = style.replace('heading', '').strip()
        try:
            return min(int(tail) + 1, 6)
        except ValueError:
            return 2
    return 0


def escape_cell(text):
    return text.replace('|', '\\|').replace('\n', ' ').strip()


def main(source, target):
    doc = Document(source)
    out = []
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if not text:
                continue
            level = heading_level(block)
            style = (block.style.name or '').lower()
            if level:
                out.append('#' * level + ' ' + text)
            elif 'list' in style:
                out.append('- ' + text)
            elif 'quote' in style:
                out.append('> ' + text)
            else:
                out.append(text)
            out.append('')
        else:
            rows = []
            for row in block.rows:
                cells = [escape_cell(cell.text) for cell in row.cells]
                rows.append('| ' + ' | '.join(cells) + ' |')
            if not rows:
                continue
            header = rows[0]
            columns = header.count('|') - 1
            separator = '| ' + ' | '.join(['---'] * columns) + ' |'
            out.append(header)
            out.append(separator)
            out.extend(rows[1:])
            out.append('')

    text = '\n'.join(out).replace('\n\n\n', '\n\n').strip() + '\n'
    with open(target, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)
    print(f'wrote {target}: {len(text)} chars, {text.count(chr(10))} lines')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
