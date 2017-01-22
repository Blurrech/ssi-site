setlocal enabledelayedexpansion
for /L %%I in (0,1,100) do (
    set "idx=00%%I"
    wget "http://constituencyboundaries.uk/resources/boundaries/wards/S92000!idx:~-3!.json"
)