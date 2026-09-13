# Apex Gains

A personal workout tracker: an athlete builds workouts from an exercise library, cycles them through a plan, and logs what they actually trained.

## Language

### Libraries and ownership

**Sample**:
An exercise, workout or plan that belongs to no athlete and is shared read-only with everyone.
_Avoid_: system data, seed, template

**Fork**:
An athlete's personal copy of a sample, made the first time they change it; from then on it stands in for that sample for that athlete.
_Avoid_: clone, customized copy (the UI labels a fork "Customized")

**Library**:
The exercises, workouts or plans an athlete sees listed: their own rows, plus the samples they have not forked when they show sample data.
_Avoid_: catalogue, collection

### Time

**Today**:
The calendar day it currently is in the athlete's own timezone. Nothing is logged against, or shown for, a later day.
_Avoid_: current date, now, local day

### References

**Historical reference**:
A reference that records what an athlete did - a logged set's exercise, the workout a session trained. It always means exactly the row it recorded, even a sample they have since forked.
_Avoid_: past reference, snapshot

**Forward-looking reference**:
A reference that names what an athlete is going to train - a plan slot's workout, a workout entry's exercise. It means the athlete's fork of that row when they have one, and the row itself otherwise.
_Avoid_: live reference, current reference
