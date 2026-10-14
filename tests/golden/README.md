# Golden CSV fixtures

Byte-exact comparisons (encoding, CRLF, quoting) land with each carrier adapter.

Layout:

```
tests/golden/<carrier>/<case>/{order.json,expected.csv}
```

Each `expected.csv` is imported once into the real carrier software. Record the date and result in that case's README.
