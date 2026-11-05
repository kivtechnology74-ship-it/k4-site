"""Offline regression tests; do not depend on ARC being reachable."""
import unittest

from arc_watch import candidate_title, extract_catalog_links, parse_detail, row_for


CATALOG = """
<html><body>
<article><a href="/listings/9285713-used-2012-ge-jenbacher-jgs-416-gs-b91">
2012 GE Jenbacher JGS 416 GS-B91 1,127 kW Natural Gas Generator Packages — 4160V, 60 Hz — 2 Available</a>
<a href="/listings/9285713-used-2012-ge-jenbacher-jgs-416-gs-b91">Details</a></article>
<article><a href="/listings/8919256-used-cat-g3520">Caterpillar G3520 Natural Gas Generators for Sale - 10 Available</a></article>
<article><a href="/listings/5555555-diesel">2018 Caterpillar 1500kW Diesel Generator</a></article>
<article><a href="/listings/6666666-gas-turbine">6 Siemens Natural Gas Turbine Generators</a></article>
</body></html>"""
DETAIL = """
<html><body><main>
<h1>2012 GE Jenbacher JGS 416 GS-B91 1,127 kW Natural Gas Generator Packages</h1>
<div>TWO AVAILABLE</div><div>Location: Grande Prairie, Canada or Call (213) 371-2848</div>
<h3>Specifications</h3>
<table>
<tr><td>Manufacturer</td><td>Jenbacher</td></tr>
<tr><td>Model</td><td>J416GS</td></tr>
<tr><td>Year</td><td>2012</td></tr>
<tr><td>Operating Hours</td><td>17,000</td></tr>
<tr><td>Condition</td><td>Used</td></tr>
<tr><td>Stock Number</td><td>ARC1051</td></tr>
<tr><td>Quantity Available</td><td>Two matching packages</td></tr>
<tr><td>KW</td><td>1127</td></tr>
<tr><td>Voltage (V)</td><td>4160</td></tr>
<tr><td>Frequency (Hz)</td><td>60</td></tr>
<tr><td>Fuel Type</td><td>Natural Gas</td></tr>
</table></main></body></html>"""
PENDING = """
<html><body><main><h1>Caterpillar G3520 Natural Gas Generators for Sale</h1>
<div>PENDING SALE</div><h3>Specifications</h3><table>
<tr><td>KW</td><td>2600</td></tr>
<tr><td>Quantity Available</td><td>10 Units</td></tr>
</table></main></body></html>"""
PRODUCTION = """
<html><body><main><h1>Brand New MWM TCG2032V16 Natural Gas Generator</h1>
<p>A factory-production supply arrangement has been proposed; final manufacturing allocation subject to confirmation.</p>
</main></body></html>"""


class ArcMonitorTests(unittest.TestCase):
    def test_catalog_deduplicates_and_excludes_diesel_and_turbines(self):
        links = extract_catalog_links(CATALOG)
        self.assertEqual(len(links), 2)
        self.assertEqual({x[0] for x in links}, {"9285713", "8919256"})
        self.assertFalse(candidate_title("Natural Gas Turbine Generators"))

    def test_structured_specifications_and_quantity(self):
        result = parse_detail("9285713", "https://www.arcpowersystems.com/listings/9285713-x", "Jenbacher", DETAIL)
        self.assertEqual(result["stock_id"], "ARC1051")
        self.assertEqual(result["quantity"], 2)
        self.assertEqual(result["power_kw"], 1127)
        self.assertEqual(result["frequency_hz"], 60)
        self.assertEqual(result["operating_hours"], 17000)
        self.assertEqual(result["condition"], "Used")
        self.assertEqual(result["verification"], "WEB / UNVERIFIED")
        self.assertEqual(len(row_for(result, "2026-11-05", "2026-11-06")), 24)

    def test_pending_sale_is_not_available(self):
        result = parse_detail("8919256", "https://www.arcpowersystems.com/listings/8919256-x", "CAT G3520", PENDING)
        self.assertEqual(result["seller_status"], "PENDING SALE")
        self.assertEqual(result["quantity"], 10)

    def test_factory_production_is_not_stock(self):
        result = parse_detail("9637072", "https://www.arcpowersystems.com/listings/9637072-x", "MWM", PRODUCTION)
        self.assertEqual(result["seller_status"], "PRODUCTION PROPOSAL / UNCONFIRMED")


if __name__ == "__main__":
    unittest.main()
