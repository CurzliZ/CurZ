def create_note(client, path: str, content: str) -> dict:
    response = client.post("/api/notes", json={"path": path, "content": content})
    assert response.status_code == 201, response.text
    return response.json()


def linked_notes(client):
    alpha = create_note(client, "alpha.md", "# Alpha\n\n[[Beta]]")
    beta = create_note(client, "beta.md", "# Beta\n\n[[Alpha]] and [[Gamma]]")
    gamma = create_note(client, "gamma.md", "# Gamma\n\n[[Beta]] and [[Delta]]")
    delta = create_note(client, "delta.md", "# Delta\n\nNo outgoing links.")
    return alpha, beta, gamma, delta


def test_neighborhood_expands_by_depth_with_explicit_edges_only(opened_client):
    alpha, beta, gamma, delta = linked_notes(opened_client)
    response = opened_client.get(
        f"/api/graph/neighborhood/{alpha['id']}",
        params={"depth": 2, "limit": 20},
    )

    assert response.status_code == 200
    graph = response.json()
    assert graph["center_id"] == alpha["id"]
    assert graph["depth"] == 2
    assert {node["id"] for node in graph["nodes"]} == {
        alpha["id"],
        beta["id"],
        gamma["id"],
    }
    assert {(edge["source"], edge["target"], edge["kind"]) for edge in graph["edges"]} == {
        (alpha["id"], beta["id"], "explicit"),
        (beta["id"], alpha["id"], "explicit"),
        (beta["id"], gamma["id"], "explicit"),
        (gamma["id"], beta["id"], "explicit"),
    }
    nodes = {node["id"]: node for node in graph["nodes"]}
    assert nodes[beta["id"]]["degree"] == 4
    assert nodes[gamma["id"]]["degree"] == 3
    assert graph["truncated"] is False
    assert delta["id"] not in nodes


def test_neighborhood_honors_limit_and_reports_truncation(opened_client):
    _alpha, beta, _gamma, _delta = linked_notes(opened_client)
    response = opened_client.get(
        f"/api/graph/neighborhood/{beta['id']}",
        params={"depth": 2, "limit": 2},
    )

    assert response.status_code == 200
    graph = response.json()
    assert len(graph["nodes"]) == 2
    assert graph["truncated"] is True


def test_graph_overview_ranks_by_degree_and_reports_omitted_nodes(opened_client):
    alpha, beta, gamma, delta = linked_notes(opened_client)
    response = opened_client.get("/api/graph/overview", params={"limit": 2})

    assert response.status_code == 200
    graph = response.json()
    assert graph["total_nodes"] == 4
    assert [node["id"] for node in graph["nodes"]] == [beta["id"], gamma["id"]]
    assert [node["degree"] for node in graph["nodes"]] == [4, 3]
    assert graph["truncated"] is True
    assert graph["edges"]
    assert all(edge["kind"] == "explicit" for edge in graph["edges"])
    assert alpha["id"] not in {node["id"] for node in graph["nodes"]}
    assert delta["id"] not in {node["id"] for node in graph["nodes"]}


def test_graph_excludes_archived_notes_and_validates_arguments(opened_client):
    _alpha, beta, gamma, _delta = linked_notes(opened_client)
    assert opened_client.post(f"/api/notes/{gamma['id']}/archive").status_code == 200
    overview = opened_client.get("/api/graph/overview", params={"limit": 20}).json()
    assert overview["total_nodes"] == 3
    assert gamma["id"] not in {node["id"] for node in overview["nodes"]}
    beta_node = next(node for node in overview["nodes"] if node["id"] == beta["id"])
    assert beta_node["degree"] == 2

    assert opened_client.get(
        f"/api/graph/neighborhood/{beta['id']}", params={"depth": 4}
    ).status_code == 422
    assert opened_client.get("/api/graph/overview", params={"limit": 5001}).status_code == 422
    assert opened_client.get("/api/graph/neighborhood/99999").status_code == 404


def test_semantic_edges_rank_topical_notes_without_explicit_links(opened_client):
    astronomy_a = create_note(
        opened_client,
        "astronomy-a.md",
        "# Astronomy and planets\n\nA telescope reveals planets, stars, and distant galaxies.",
    )
    astronomy_b = create_note(
        opened_client,
        "astronomy-b.md",
        "# Astronomy and planets\n\nA telescope studies distant galaxies, stars, and planets.",
    )
    cooking = create_note(
        opened_client,
        "cooking.md",
        "# Cooking dinner\n\nBoil pasta, chop vegetables, and prepare a tomato sauce.",
    )
    response = opened_client.get(
        "/api/graph/overview",
        params={"limit": 50, "explicit": False, "semantic": True, "threshold": 0.25},
    )

    assert response.status_code == 200
    graph = response.json()
    edges = [edge for edge in graph["edges"] if edge["kind"] == "semantic"]
    pair = {astronomy_a["id"], astronomy_b["id"]}
    astronomy_matches = [
        edge for edge in edges if {edge["source"], edge["target"]} == pair
    ]
    assert astronomy_matches
    assert astronomy_matches[0]["score"] > 0.1
    assert not any(
        {edge["source"], edge["target"]}
        == {astronomy_a["id"], cooking["id"]}
        for edge in edges
    )


def test_graph_layout_round_trips_persisted_positions(opened_client):
    note = create_note(opened_client, "positioned.md", "# Positioned\n\nA note with no links.")
    initial = opened_client.get(
        "/api/graph/neighborhood/{}".format(note["id"])
    ).json()
    assert initial["nodes"][0]["x"] is not None
    assert initial["nodes"][0]["y"] is not None
    assert initial["nodes"][0]["position_saved"] is False

    save = opened_client.post(
        "/api/graph/layout",
        json={"positions": [{"note_id": note["id"], "x": 12.5, "y": -7.25}]},
    )
    assert save.status_code == 200
    assert save.json() == {"saved": 1}
    reloaded = opened_client.get(
        "/api/graph/neighborhood/{}".format(note["id"])
    ).json()
    assert (reloaded["nodes"][0]["x"], reloaded["nodes"][0]["y"]) == (12.5, -7.25)
    assert reloaded["nodes"][0]["position_saved"] is True

    reset = opened_client.delete("/api/graph/layout")
    assert reset.status_code == 200
    assert reset.json() == {"reset": True}
    reset_graph = opened_client.get(
        "/api/graph/neighborhood/{}".format(note["id"])
    ).json()
    assert reset_graph["nodes"][0]["position_saved"] is False
