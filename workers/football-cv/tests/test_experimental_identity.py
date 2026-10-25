"""Synthetic adversarial evidence only; not a real-footage re-ID evaluation."""
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.experimental_identity import (
    ExperimentalResolverOutput, MatchScope, NormalizedBox, ResolverRequest, resolve,
)


SCOPE = dict(jobId="job", sourceSha256="a" * 64, generation=0, modelSetDigest="b" * 64)
BOX = dict(x=0.1, y=0.1, width=0.2, height=0.4)


def observation(id="o", time=1.0, **changes):
    return dict(observationId=id, frameIndex=int(time * 25), timestampSec=time,
                box=deepcopy(BOX), evidenceHash="c" * 64, **changes)


def segment(id="s", obs=None, start=0.0, end=10.0):
    return dict(segmentId=id, scope=deepcopy(SCOPE),
                context=dict(startSec=start, endSec=end), owned=dict(startSec=start, endSec=end),
                tracklets=[dict(trackletId="t_" + id, observations=obs or [observation()])])


def body():
    return dict(scope=deepcopy(SCOPE), targetJersey="17", segments=[segment()], anchors=[
        dict(anchorId="a", scope=deepcopy(SCOPE), frameIndex=25, timestampSec=1.0,
             box=deepcopy(BOX), evidenceHash="c" * 64)])


def run(value):
    return resolve(ResolverRequest.model_validate(value))


def states(result):
    return {o.observationId: o.state for o in result.observations}


def test_anchor_only_confirms_observation_not_track_or_gap():
    value = body()
    value["segments"][0]["tracklets"][0]["observations"] += [observation("later", 9.0)]
    result = run(value)
    assert states(result) == {"o": "CONFIRMED_OBSERVATION", "later": "UNKNOWN"}
    assert result.confirmedCoverageSec == 0
    assert result.ownedCoverageSec == 10
    assert [(w.startSec, w.endSec, w.state) for w in result.uncertainWindows] == [(0, 10, "UNKNOWN")]
    assert ExperimentalResolverOutput.model_validate_json(result.model_dump_json()) == result


@pytest.mark.parametrize("field", list(SCOPE))
@pytest.mark.parametrize("location", ["anchor", "segment"])
def test_all_scope_fields_must_match(field, location):
    value = body()
    scope = value["anchors" if location == "anchor" else "segments"][0]["scope"]
    scope[field] = 1 if field == "generation" else "d" * 64 if field != "jobId" else "other"
    with pytest.raises(ValidationError):
        run(value)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -float("inf"), -0.1, 1.1, "0.2", True])
def test_box_strict_finite_bounds(bad):
    with pytest.raises(ValidationError):
        NormalizedBox.model_validate({**BOX, "x": bad})


@pytest.mark.parametrize("patch", [dict(width=0.0), dict(height=-1.0), dict(x=0.9), dict(face="x")])
def test_box_extent_and_extra_rejected(patch):
    with pytest.raises(ValidationError):
        NormalizedBox.model_validate({**BOX, **patch})


@pytest.mark.parametrize("path", ["request", "scope", "anchor", "segment", "track", "observation", "interval"])
def test_extra_forbidden_at_every_level(path):
    value = body()
    targets = dict(request=value, scope=value["scope"], anchor=value["anchors"][0],
                   segment=value["segments"][0], track=value["segments"][0]["tracklets"][0],
                   observation=value["segments"][0]["tracklets"][0]["observations"][0],
                   interval=value["segments"][0]["owned"])
    targets[path]["embedding"] = [0.1]
    with pytest.raises(ValidationError):
        run(value)


@pytest.mark.parametrize("kind", ["anchor", "segment", "track", "observation"])
def test_duplicate_ids_rejected(kind):
    value = body()
    items = {"anchor": value["anchors"], "segment": value["segments"],
             "track": value["segments"][0]["tracklets"],
             "observation": value["segments"][0]["tracklets"][0]["observations"]}[kind]
    items.append(deepcopy(items[0]))
    with pytest.raises(ValidationError):
        run(value)


def test_unique_cross_segment_overlap_and_owned_union():
    value = body()
    value["segments"].append(segment("s2", [observation("copy")], start=0.0, end=12.0))
    result = run(value)
    assert set(states(result).values()) == {"CONFIRMED_OBSERVATION"}
    assert result.ownedCoverageSec == 12
    value["segments"].reverse()
    assert run(value) == result


def test_competing_detection_in_same_segment_is_ambiguous():
    value = body()
    value["segments"][0]["tracklets"].append(dict(trackletId="competitor", observations=[observation("other")]))
    result = run(value)
    assert set(states(result).values()) == {"AMBIGUOUS"}
    assert result.anchors[0].state == "AMBIGUOUS"


@pytest.mark.parametrize("change", [dict(readableJersey="7"), dict(evidenceHash="d" * 64)])
def test_conflicting_copy_invalidates_anchor(change):
    value = body()
    copy = observation("copy")
    copy.update(change)
    value["segments"].append(segment("s2", [copy]))
    assert set(states(run(value)).values()) == {"CONFLICT"}


def test_appearance_or_readable_jersey_alone_never_confirms():
    value = body()
    value["anchors"] = []
    value["segments"][0]["tracklets"][0]["observations"][0].update(appearanceScore=1.0, readableJersey="17")
    assert states(run(value)) == {"o": "UNKNOWN"}


@pytest.mark.parametrize("field,bad", [("timestampSec", float("nan")), ("appearanceScore", float("inf")),
                                       ("frameIndex", True), ("readableJersey", "１７"),
                                       ("evidenceHash", "A" * 64)])
def test_observation_invalid_values(field, bad):
    value = body()
    value["segments"][0]["tracklets"][0]["observations"][0][field] = bad
    with pytest.raises(ValidationError):
        run(value)


def test_corrected_anchor_replaces_context_without_hidden_identity():
    value = body()
    value["segments"][0]["owned"] = dict(startSec=2.0, endSec=5.0)
    assert states(run(value))["o"] == "CONFIRMED_OBSERVATION"  # context-only point
    value["anchors"][0]["evidenceHash"] = "d" * 64
    assert states(run(value))["o"] == "CONFLICT"
    value["anchors"] = []
    result = run(value)
    assert states(result)["o"] == "UNKNOWN"
    assert result.ownedCoverageSec == 3


@pytest.mark.parametrize("field", ["timestampSec", "frameIndex"])
def test_anchor_requires_exact_frame_and_time(field):
    value = body()
    value["anchors"][0][field] += 1
    assert run(value).anchors[0].state == "UNMATCHED"


def test_small_caps_and_context_boundaries():
    for mutate in [lambda v: v["anchors"].extend(v["anchors"] * 16),
                   lambda v: v["segments"].extend(v["segments"] * 8),
                   lambda v: v["segments"][0]["context"].update(endSec=121.0),
                   lambda v: v["segments"][0]["owned"].update(endSec=11.0),
                   lambda v: v["segments"][0]["tracklets"][0]["observations"].extend([observation()] * 32)]:
        value = body()
        mutate(value)
        with pytest.raises(ValidationError):
            run(value)


def test_untrusted_construct_revalidated():
    value = ResolverRequest.model_validate(body())
    value.segments[0].tracklets[0].observations.append(value.segments[0].tracklets[0].observations[0])
    with pytest.raises(ValidationError):
        resolve(value)


def test_disjoint_simultaneous_anchors_are_not_two_confirmed_targets():
    value = body()
    other = observation("other")
    other["box"]["x"] = 0.7
    value["segments"][0]["tracklets"].append(dict(trackletId="other", observations=[other]))
    anchor = deepcopy(value["anchors"][0])
    anchor.update(anchorId="other", box=other["box"])
    value["anchors"].append(anchor)
    assert set(states(run(value)).values()) == {"AMBIGUOUS"}
    assert {a.state for a in run(value).anchors} == {"AMBIGUOUS"}


def test_overlapping_chain_does_not_create_transitive_identity():
    value = body()
    for i, x in enumerate([0.16, 0.22]):
        copy = observation("copy" + str(i))
        copy["box"]["x"] = x
        value["segments"].append(segment("s" + str(i + 2), [copy]))
    assert "CONFIRMED_OBSERVATION" not in states(run(value)).values()


def test_duplicate_copy_with_inconsistent_frame_time_is_rejected():
    value = body()
    copy = observation("copy")
    copy["timestampSec"] = 1.1
    value["segments"].append(segment("s2", [copy]))
    with pytest.raises(ValidationError):
        run(value)


def test_disjoint_owned_intervals_leave_gap_unanalysed():
    value = body()
    value["segments"].append(segment("s2", [observation("later", 21.0)], start=20.0, end=25.0))
    result = run(value)
    assert result.ownedCoverageSec == 15
    assert [(w.startSec, w.endSec) for w in result.uncertainWindows] == [(0, 10), (20, 25)]


def test_full_global_observation_cap_and_one_over():
    value = body()
    value["anchors"] = []
    tracks = []
    for t in range(16):
        tracks.append(dict(trackletId="t" + str(t), observations=[
            observation("o_" + str(t) + "_" + str(i), float(i)) for i in range(32)]))
    value["segments"][0]["context"]["endSec"] = 32.0
    value["segments"][0]["tracklets"] = tracks
    assert len(run(value).observations) == 512
    value["segments"].append(segment("extra", [observation("extra")]))
    with pytest.raises(ValidationError):
        run(value)


def test_output_forbids_nonfinite_and_extra_fields():
    output = run(body()).model_dump()
    for patch in [dict(ownedCoverageSec=float("nan")), dict(confirmedCoverageSec=1.0), dict(gallery=[])]:
        with pytest.raises(ValidationError):
            ExperimentalResolverOutput.model_validate({**output, **patch})


def test_scope_strict_generation_and_hash():
    for patch in [dict(generation=True), dict(generation=1000001), dict(sourceSha256="a" * 65)]:
        with pytest.raises(ValidationError):
            MatchScope.model_validate({**SCOPE, **patch})
