import unittest
from datetime import date
from .operations_rules import task_fields, cluster_fields, health

TASK={'title':'AI guide','stage':'idea','priority':'medium','keyword':'AI','audience':'SMEs','intent':'informational','brief':'Private brief','outline':'Outline','due':'2027-02-28','assigneeId':None,'clusterId':None}
CLUSTER={'name':'AI','keyword':'automation','market':'Singapore','intent':'commercial','keywords':['workflow','AI agents'],'notes':'','archived':False}
class OperationsRuleTests(unittest.TestCase):
    def test_task_validation(self):
        self.assertEqual(task_fields(TASK)['due'],date(2027,2,28))
        for key,value in [('stage','published'),('assigneeId',True),('due','2027-02-30'),('title',''),('brief','a'*4001)]:
            with self.subTest(key=key),self.assertRaises(ValueError): task_fields({**TASK,key:value})
    def test_cluster_keywords(self):
        self.assertEqual(cluster_fields(CLUSTER)['keywords'],['workflow','AI agents'])
        with self.assertRaises(ValueError): cluster_fields({**CLUSTER,'keywords':['AI','ai']})
    def test_health_duplicate_age_and_missing(self):
        rows=[{'path':'/a','title':'AI guide','description':'','keyword':'AI','modified':date(2025,1,1)},{'path':'/b','title':'  ai GUIDE ','description':'Good','keyword':'ai','modified':date(2026,11,25)}]
        findings=health(rows,date(2026,11,25));self.assertEqual(len(findings),2)
        self.assertEqual(len(findings[0]['findings']),4);self.assertEqual(len(findings[1]['findings']),2)
