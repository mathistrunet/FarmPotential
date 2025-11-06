from workers.safran.config import parse_years


def test_parse_years_supports_ranges_and_lists():
    assert parse_years("2020") == [2020]
    assert parse_years("2020..2022") == [2020, 2021, 2022]
    assert parse_years("2021-2020") == [2020, 2021]
    assert parse_years("2019,2021") == [2019, 2021]
