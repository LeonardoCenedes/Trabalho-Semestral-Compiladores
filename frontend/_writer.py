
html = open('_new_index.html', 'r', encoding='utf-8').read()
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Done', len(html.splitlines()), 'lines')
