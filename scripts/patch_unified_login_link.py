from pathlib import Path

path = Path('plataforma-demo.html')
text = path.read_text(encoding='utf-8')
original = text

# Re-run marker: point account button to unified login.
text = text.replace('href="/admin/login.html">Ya tengo cuenta', 'href="/login.html">Ya tengo cuenta')

if text != original:
    path.write_text(text, encoding='utf-8')
    print('patched unified login link')
else:
    print('already patched')
