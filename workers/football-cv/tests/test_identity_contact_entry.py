"""Hard evidence inside contact must respect the contact's actual predecessor."""
import numpy as np
import pytest

from scoutx_tracker import identity


@pytest.mark.parametrize('predecessor,propagates', [(10, True), (30, False)])
def test_number_inside_contact_does_not_anchor_an_unrelated_handoff(monkeypatch, predecessor, propagates):
    summary = []
    rows = []
    for k, tid in enumerate((10, 20, 30)):
        start = (0.0, 0.4, 0.0)[k]
        summary.append(dict(tid=tid, kit1=0.8, kit2=0, n=3, t0=start, t1=start + 0.2,
                            segment=0, p_start=[100, 300], p_end=[100, 300], h_med=200,
                            sig=np.array([1., 0.]), emb=None))
        for j in range(3):
            rows.append([round((start + j / 10) * 10), start + j / 10, tid,
                         80, 100, 120, 300, 0.9, len(rows)])
    rows = np.asarray(rows, float)
    by_tid = {tid: np.flatnonzero(rows[:, 2] == tid) for tid in (10, 20, 30)}
    # Isolate the evidence propagation stage after the chain solver has selected
    # a nearby incoming piece and the number-bearing contact piece.
    monkeypatch.setattr(identity, '_best_chain', lambda *a, **kw: ([0, 1], {1: 'handoff'}))
    result = identity.resolve_identity(summary, {20: [(4, '20', 0.99, 'test')]},
                                       identity.Target(number='20', kit_primary='orange'),
                                       10, rows, by_tid, n_questions=0,
                                       contact_pre={20: predecessor})
    assert result.evidence[1] == 'number'
    assert (result.evidence[0] == 'anchored') is propagates
    assert 0 not in result.confirmed
