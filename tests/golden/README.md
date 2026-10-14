# Golden CSV fixtures

Byte-exact comparisons (encoding, CRLF, quoting) live next to each carrier adapter.

Yamato B2 Cloud is in `yamato/`. Sagawa and Yu-Print R are still scaffolds.

Layout:

```
tests/golden/<carrier>/<case>/{order.json,expected.csv}
```

Each `expected.csv` is imported once into the real carrier software. Record the date and result in that case's README.
