"""Validation and merge helpers for the workspace JSON contract.

The browser uses Zod as the primary contract. FastAPI still validates the
security-relevant shape and all cross-record relations so a direct API call
cannot persist a broken workspace.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

MAX_TREES = 100
MAX_NODES = 1000
MAX_RECORDS = 20000
MAX_QUIZ = 30


class DataValidationError(ValueError):
    pass


def _fail(message: str) -> None:
    raise DataValidationError(message)


def _obj(value: Any, label: str) -> dict:
    if not isinstance(value, dict):
        _fail(f"{label}格式不正确")
    return value


def _list(value: Any, label: str, maximum: int) -> list:
    if not isinstance(value, list):
        _fail(f"{label}格式不正确")
    if len(value) > maximum:
        _fail(f"{label}数量超过限制")
    return value


def _str(value: Any, label: str, maximum: int, minimum: int = 0) -> str:
    if not isinstance(value, str):
        _fail(f"{label}格式不正确")
    if len(value) < minimum or len(value) > maximum:
        _fail(f"{label}长度不正确")
    return value


def _id(value: Any, label: str = "ID") -> str:
    return _str(value, label, 100, 1)


def _date(value: Any, label: str) -> str:
    if not isinstance(value, str) or len(value) > 80:
        _fail(f"{label}时间格式不正确")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        _fail(f"{label}时间格式不正确")
    if parsed.tzinfo is None:
        _fail(f"{label}时间必须包含时区")
    return value


def _int(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail(f"{label}必须是整数")
    if value < minimum or value > maximum:
        _fail(f"{label}超出允许范围")
    return value


def _number(value: Any, label: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail(f"{label}必须是数字")
    if value < minimum or value > maximum:
        _fail(f"{label}超出允许范围")
    return float(value)


def now_iso(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return current.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def empty_card(now: datetime | None = None) -> dict:
    return {
        "due": now_iso(now),
        "stability": 0,
        "difficulty": 0,
        "elapsed_days": 0,
        "scheduled_days": 0,
        "reps": 0,
        "lapses": 0,
        "learning_steps": 0,
        "state": 0,
    }


def blank_data() -> dict:
    return {
        "version": 1,
        "demo": False,
        "settings": {"name": "学习者", "dailyMinutes": 30},
        "trees": [],
        "nodes": [],
        "sessions": [],
        "reviews": [],
    }


def _validate_card(value: Any, label: str) -> None:
    card = _obj(value, label)
    _date(card.get("due"), f"{label}到期时间")
    _number(card.get("stability"), f"{label}.stability", 0, 1e8)
    _number(card.get("difficulty"), f"{label}.difficulty", 0, 10)
    _number(card.get("elapsed_days"), f"{label}.elapsed_days", 0, 1e8)
    _number(card.get("scheduled_days"), f"{label}.scheduled_days", 0, 36500)
    _int(card.get("reps"), f"{label}.reps", 0, 1_000_000_000)
    _int(card.get("lapses"), f"{label}.lapses", 0, 1_000_000_000)
    _int(card.get("learning_steps"), f"{label}.learning_steps", 0, 1000)
    _int(card.get("state"), f"{label}.state", 0, 3)
    if card.get("last_review") is not None:
        _date(card["last_review"], f"{label}上次复习时间")


def _validate_tree(tree: Any) -> None:
    item = _obj(tree, "学习树")
    _id(item.get("id"), "学习树 ID")
    _str(item.get("title"), "学习树标题", 60, 1)
    _str(item.get("description", ""), "学习树描述", 300)
    if item.get("color") not in ("green", "blue", "amber"):
        _fail("学习树颜色不正确")
    _date(item.get("createdAt"), "学习树创建时间")
    parent = item.get("parentTreeId")
    if parent is not None:
        _id(parent, "上级学习树 ID")
    prerequisites = item.get("prerequisiteTreeIds", [])
    if not isinstance(prerequisites, list) or len(prerequisites) > 99:
        _fail("前置学习树格式不正确")
    for prerequisite in prerequisites:
        _id(prerequisite, "前置学习树 ID")


def _validate_quiz(quiz: Any, label: str) -> None:
    questions = _list(quiz, label, MAX_QUIZ)
    seen: set[str] = set()
    for question in questions:
        item = _obj(question, "测验题")
        question_id = _id(item.get("id"), "测验题 ID")
        if question_id in seen:
            _fail("测验题目 ID 不能重复")
        seen.add(question_id)
        _str(item.get("prompt"), "测验题干", 2000, 1)
        options = item.get("options", [])
        if not isinstance(options, list) or len(options) > 6:
            _fail("测验选项格式不正确")
        for option in options:
            _str(option, "测验选项", 1000, 1)
        _str(item.get("explanation", ""), "测验解析", 4000)


def _validate_node(node: Any) -> None:
    item = _obj(node, "知识点")
    _id(item.get("id"), "知识点 ID")
    _id(item.get("treeId"), "知识点所属学习树 ID")
    parent = item.get("parentId")
    if parent is not None:
        _id(parent, "上级知识点 ID")
    _str(item.get("title"), "知识点标题", 80, 1)
    _str(item.get("note", ""), "知识点笔记", 4000)
    if item.get("learnedAt") is not None:
        _date(item["learnedAt"], "已学时间")
    _str(item.get("content", ""), "讲义内容", 30000)
    _validate_quiz(item.get("quiz", []), "测验")
    _str(item.get("question", ""), "回忆题", 2000)
    _str(item.get("answer", ""), "参考答案", 4000)
    resource = item.get("resource", "")
    _str(resource, "资源链接", 1000)
    if resource and not (
        resource.lower().startswith("https://") or resource.lower().startswith("http://")
    ):
        _fail("资源链接须以 http:// 或 https:// 开头")
    _validate_card(item.get("card"), "复习卡片")
    _date(item.get("createdAt"), "知识点创建时间")


def _validate_session(session: Any) -> None:
    item = _obj(session, "学习记录")
    _id(item.get("id"), "学习记录 ID")
    _id(item.get("nodeId"), "学习记录知识点 ID")
    _date(item.get("at"), "学习记录时间")
    _int(item.get("minutes"), "学习时长", 1, 720)
    _int(item.get("confidence"), "掌握程度", 1, 5)
    correct, total = item.get("correct"), item.get("total")
    if (correct is None) != (total is None):
        _fail("正确题数与总题数必须同时填写")
    if total is not None:
        _int(total, "总题数", 1, 1000)
        _int(correct, "正确题数", 0, 1000)
        if correct > total:
            _fail("正确题数不能超过总题数")
    _str(item.get("note", ""), "学习记录备注", 4000)
    answers = item.get("quizAnswers")
    if answers is not None:
        for answer in _list(answers, "逐题作答", MAX_QUIZ):
            _obj(answer, "逐题作答")


def _validate_review(review: Any) -> None:
    item = _obj(review, "复习记录")
    _id(item.get("id"), "复习记录 ID")
    _id(item.get("nodeId"), "复习记录知识点 ID")
    _date(item.get("at"), "复习时间")
    _int(item.get("rating"), "复习评分", 1, 4)
    _date(item.get("due"), "下次复习时间")
    _str(item.get("response", ""), "回忆内容", 4000)


def _validate_unique(items: list[dict], label: str) -> dict[str, dict]:
    mapping: dict[str, dict] = {}
    for item in items:
        item_id = item["id"]
        if item_id in mapping:
            _fail(f"{label}中包含重复 ID")
        mapping[item_id] = item
    return mapping


def _validate_tree_graph(trees: list[dict]) -> None:
    tree_map = {tree["id"]: tree for tree in trees}
    for tree in trees:
        parent = tree.get("parentTreeId")
        if parent and parent not in tree_map:
            _fail("上级学习树不存在")
        prerequisites = tree.get("prerequisiteTreeIds", [])
        if len(set(prerequisites)) != len(prerequisites):
            _fail("前置学习树不能重复")
        for prerequisite in prerequisites:
            if prerequisite not in tree_map:
                _fail("前置学习树不存在")
        ancestors = {tree["id"]}
        current = parent
        while current:
            if current in ancestors:
                _fail("学习树的子级关系不能包含循环")
            ancestors.add(current)
            if len(ancestors) > 30:
                _fail("学习树最多支持 30 层嵌套")
            current = tree_map.get(current, {}).get("parentTreeId")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(tree_id: str) -> bool:
        if tree_id in visiting:
            return False
        if tree_id in visited:
            return True
        visiting.add(tree_id)
        dependencies = list(tree_map[tree_id].get("prerequisiteTreeIds", []))
        dependencies.extend(
            tree["id"] for tree in trees if tree.get("parentTreeId") == tree_id
        )
        ancestors: set[str] = set()
        parent = tree_map[tree_id].get("parentTreeId")
        while parent and parent not in ancestors:
            ancestors.add(parent)
            dependencies.extend(tree_map[parent].get("prerequisiteTreeIds", []))
            parent = tree_map[parent].get("parentTreeId")
        for dependency in dependencies:
            if not visit(dependency):
                return False
        visiting.remove(tree_id)
        visited.add(tree_id)
        return True

    if any(not visit(tree["id"]) for tree in trees):
        _fail("学习树的依赖与子级关系不能形成循环")


def _validate_node_graph(nodes: list[dict], trees: dict[str, dict]) -> None:
    node_map = {node["id"]: node for node in nodes}
    for node in nodes:
        if node["treeId"] not in trees:
            _fail("知识点所属学习树不存在")
        seen = {node["id"]}
        current = node.get("parentId")
        while current:
            parent = node_map.get(current)
            if parent is None or parent["treeId"] != node["treeId"]:
                _fail("知识点的上级不存在或属于另一棵树")
            if current in seen:
                _fail("知识树不能包含循环")
            seen.add(current)
            if len(seen) > 30:
                _fail("知识树最多支持 30 层")
            current = parent.get("parentId")


def validate_data(value: Any) -> dict:
    data = _obj(value, "工作区数据")
    if data.get("version") != 1:
        _fail("工作区数据版本不正确")
    if not isinstance(data.get("demo"), bool):
        _fail("示例空间标记不正确")
    settings = _obj(data.get("settings"), "偏好设置")
    _str(settings.get("name"), "显示名称", 30, 1)
    _int(settings.get("dailyMinutes"), "每日目标", 5, 480)

    trees = _list(data.get("trees"), "学习树", MAX_TREES)
    nodes = _list(data.get("nodes"), "知识点", MAX_NODES)
    sessions = _list(data.get("sessions"), "学习记录", MAX_RECORDS)
    reviews = _list(data.get("reviews"), "复习记录", MAX_RECORDS)

    for tree in trees:
        _validate_tree(tree)
    for node in nodes:
        _validate_node(node)
    for session in sessions:
        _validate_session(session)
    for review in reviews:
        _validate_review(review)

    tree_map = _validate_unique(trees, "学习树")
    node_map = _validate_unique(nodes, "知识点")
    _validate_unique(sessions, "学习记录")
    _validate_unique(reviews, "复习记录")
    _validate_tree_graph(trees)
    _validate_node_graph(nodes, tree_map)

    for item in (*sessions, *reviews):
        if item["nodeId"] not in node_map:
            _fail("学习记录对应的知识点不存在")

    return data


def validate_course_package(value: Any) -> dict:
    package = _obj(value, "课程包")
    if package.get("format") != "learning-tree-course":
        _fail("课程包格式标识不正确")
    if package.get("version") != 1:
        _fail("课程包版本不正确")
    _str(package.get("name"), "课程包名称", 100, 1)
    if package.get("release") is not None:
        _str(package["release"], "课程包版本", 60, 1)
    trees = _list(package.get("trees"), "课程包学习树", MAX_TREES)
    nodes = _list(package.get("nodes"), "课程包知识点", MAX_NODES)
    if not trees:
        _fail("课程包至少需要一棵学习树")

    for tree in trees:
        item = _obj(tree, "课程包学习树")
        _id(item.get("id"), "课程包学习树 ID")
        _str(item.get("title"), "课程包学习树标题", 60, 1)
        _str(item.get("description", ""), "课程包学习树描述", 300)
        if item.get("color", "blue") not in ("green", "blue", "amber"):
            _fail("课程包学习树颜色不正确")
        _id(item["id"], "课程包学习树 ID")

    for node in nodes:
        item = _obj(node, "课程包知识点")
        _id(item.get("id"), "课程包知识点 ID")
        _id(item.get("treeId"), "课程包知识点所属学习树 ID")
        _str(item.get("title"), "课程包知识点标题", 80, 1)
        _str(item.get("content", ""), "课程包讲义内容", 30000)
        _validate_quiz(item.get("quiz", []), "课程包测验")
        _str(item.get("question", ""), "课程包回忆题", 2000)
        _str(item.get("answer", ""), "课程包参考答案", 4000)
        _str(item.get("resource", ""), "课程包资源链接", 1000)

    if len({tree["id"] for tree in trees}) != len(trees):
        _fail("课程包中存在重复的学习树 ID")
    if len({node["id"] for node in nodes}) != len(nodes):
        _fail("课程包中存在重复的知识点 ID")
    return package


def merge_course_package(data: dict, package: dict, now: datetime | None = None) -> dict:
    timestamp = now_iso(now)
    trees = {item["id"]: deepcopy(item) for item in data["trees"]}
    nodes = {item["id"]: deepcopy(item) for item in data["nodes"]}

    for tree in package["trees"]:
        previous = trees.get(tree["id"])
        trees[tree["id"]] = {
            "description": "",
            "color": "blue",
            "parentTreeId": None,
            "prerequisiteTreeIds": [],
            **deepcopy(tree),
            "createdAt": (previous or {}).get("createdAt") or timestamp,
        }

    for node in package["nodes"]:
        previous = nodes.get(node["id"])
        same_recall = bool(
            previous
            and previous.get("question") == node.get("question")
            and previous.get("answer") == node.get("answer")
        )
        merged = {
            "parentId": None,
            "question": "",
            "answer": "",
            "resource": "",
            "note": "",
            **deepcopy(node),
            "createdAt": (previous or {}).get("createdAt") or timestamp,
        }
        if previous and previous.get("learnedAt"):
            merged["learnedAt"] = previous["learnedAt"]
        merged["card"] = (
            deepcopy(previous["card"])
            if same_recall and previous and previous.get("card")
            else empty_card(now)
        )
        nodes[node["id"]] = merged

    return validate_data(
        {
            **deepcopy(data),
            "trees": list(trees.values()),
            "nodes": list(nodes.values()),
        }
    )
