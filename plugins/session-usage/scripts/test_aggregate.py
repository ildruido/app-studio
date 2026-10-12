import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
from aggregate import aggregate, load

HDR = "taken_at,session_id,kind,title,parent_session_id,model,status,input,output,cache_read,cache_write,cost_usd\n"


def make(lines):
    f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
    f.write(HDR + "\n".join(lines) + "\n"); f.close()
    return load(f.name)


class T(unittest.TestCase):
    def test_daily_delta_and_baseline(self):
        rows = make([
            "2026-10-11T06:00:00Z,a,thread,A,p,opus,idle,10,100,1000,50,1.0",
            "2026-10-11T06:00:00Z,b,coordinator,B,,opus,idle,1,10,100,5,0.1",
            "2026-10-12T06:00:00Z,a,thread,A,p,opus,idle,10,300,3000,70,1.6",
            "2026-10-12T06:00:00Z,b,coordinator,B,,opus,idle,1,10,100,5,0.1",
        ])
        r = aggregate(rows)
        d0, d1 = r["daily"]
        self.assertTrue(d0["baseline"]); self.assertEqual(d0["active"], 0)
        self.assertEqual(d1["active"], 1)           # only A grew
        self.assertEqual(d1["nc"], (300 - 100) + (70 - 50))
        self.assertAlmostEqual(d1["cost"], 0.6)
        self.assertEqual(r["sessions"][0]["nc"], 10 + 300 + 70)

    def test_skipped_day_carries_forward(self):
        rows = make([
            "2026-10-11T06:00:00Z,a,thread,A,p,opus,idle,0,100,0,0,1.0",
            "2026-10-14T06:00:00Z,a,thread,A,p,opus,idle,0,400,0,0,2.0",
        ])
        r = aggregate(rows)
        self.assertEqual([x["d"] for x in r["daily"]][-1], "2026-10-14")
        self.assertEqual(sum(x["nc"] for x in r["daily"][1:]), 300)

    def test_prefix_normalised(self):
        rows = make([
            "2026-10-11T06:00:00Z,cse_a,thread,A,p,opus,idle,0,100,0,0,1.0",
            "2026-10-12T06:00:00Z,session_a,thread,A,p,opus,idle,0,200,0,0,2.0",
        ])
        self.assertEqual(len(aggregate(rows)["sessions"]), 1)

    def test_outlier(self):
        lines = [f"2026-10-11T06:00:00Z,t{i},thread,T{i},p,opus,idle,0,10,0,0,1.0" for i in range(4)]
        lines.append("2026-10-11T06:00:00Z,big,thread,Big,p,opus,idle,0,10,0,0,9.0")
        r = aggregate(make(lines))
        self.assertEqual(r["summary"]["outliers"], ["big"])


if __name__ == "__main__":
    unittest.main()
