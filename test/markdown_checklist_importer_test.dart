import 'package:flutter_test/flutter_test.dart';
import 'package:ada/data/services/markdown/markdown_sync_service.dart';

void main() {
  group('parseMarkdownChecklists', () {
    const sampleMarkdown = '''
# Project Tasks

- [ ] Open task 1
- [x] Completed task 1
- [X] Completed task 2 with uppercase X
- [ ] Open task 2
* Not a checklist item
Just some paragraph
- [ ]   Open task 3 with whitespace   
''';

    test('ignores completed tasks by default', () {
      final tasks = parseMarkdownChecklists(sampleMarkdown);
      expect(tasks.length, 3);
      expect(tasks[0].content, 'Open task 1');
      expect(tasks[1].content, 'Open task 2');
      expect(tasks[2].content, 'Open task 3 with whitespace');
    });

    test('includes completed tasks when includeCompleted is true', () {
      final tasks = parseMarkdownChecklists(sampleMarkdown, includeCompleted: true);
      expect(tasks.length, 5);
      expect(tasks.map((t) => t.content), containsAll([
        'Open task 1',
        'Completed task 1',
        'Completed task 2 with uppercase X',
        'Open task 2',
        'Open task 3 with whitespace',
      ]));
    });
  });
}
