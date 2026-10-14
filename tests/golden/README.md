# Golden CSV fixtures

Byte-exact comparisons (encoding, CRLF, quoting) live next to each carrier adapter.

Yamato B2 Cloud is in `yamato/`. Sagawa e飛伝III is in `sagawa/`. Yu-Print R is in `yupackR/`.

Layout:

```
tests/golden/<carrier>/<case>/{order.json,expected.csv}
```

Each `expected.csv` is imported once into the real carrier software. Record the date and result in that case's README.
